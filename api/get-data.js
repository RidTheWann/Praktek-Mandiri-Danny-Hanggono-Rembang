import { google } from 'googleapis';
import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}
if (!spreadsheetId) {
  throw new Error("SPREADSHEET_ID environment variable not set.");
}

const client = new MongoClient(mongodbUri);

/**
 * Fungsi untuk mengambil data dari SEMUA sheet (tab) di dalam satu spreadsheet.
 * Menggabungkan kolom tindakan jika diperlukan dan melewati baris yang tidak memiliki Tanggal Kunjungan.
 */
async function getAllSheetsData(queryParams) {
  try {
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });

    // Ambil metadata untuk daftar sheet
    const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);

    let allData = [];

    // Iterasi setiap sheet
    for (const sheetName of sheetNames) {
      try {
        // Ubah range sesuai dengan jumlah kolom di sheet Anda (misal A1:N)
        const range = `'${sheetName}'!A1:N`;
        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const rows = result.data.values;
        if (!rows || rows.length === 0) continue;

        // Baris pertama sebagai header
        const header = rows[0];
        let data = rows.slice(1).map((row) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] ? row[i].trim() : "";
          });
          return obj;
        });

        // Skip baris tanpa Tanggal Kunjungan
        data = data.filter(obj => obj["Tanggal Kunjungan"] && obj["Tanggal Kunjungan"] !== "-");

        // Gabungkan kolom tindakan jika tidak ada kolom "Tindakan"
        const tindakanFields = [
          "Obat",
          "Cabut Anak",
          "Cabut Dewasa",
          "Tambal Sementara",
          "Tambal Tetap",
          "Scaling",
          "Rujuk"
        ];
        data.forEach(obj => {
          // Hanya jika field "Tindakan" belum ada (jika sudah ada, anggap data sudah lengkap)
          if (!obj["Tindakan"]) {
            let arr = [];
            tindakanFields.forEach(field => {
              if (obj[field] && obj[field].trim() !== "" && obj[field].toLowerCase() !== "no") {
                arr.push(field);
              }
              // Hapus kolom aslinya agar tidak mengotori data
              delete obj[field];
            });
            if (arr.length > 0) {
              obj["Tindakan"] = arr.join(", ");
            }
          }
        });

        allData = allData.concat(data);
      } catch (innerError) {
        console.error(`Error reading sheet "${sheetName}":`, innerError);
      }
    }

    // Filter berdasarkan queryParams jika diperlukan
    const { tanggal, month } = queryParams;
    if (tanggal) {
      allData = allData.filter(item => item["Tanggal Kunjungan"] === tanggal);
    } else if (month) {
      allData = allData.filter(item =>
        item["Tanggal Kunjungan"] && item["Tanggal Kunjungan"].startsWith(month)
      );
    }

    return allData;
  } catch (error) {
    console.error("Error fetching multiple sheets data:", error);
    throw error;
  }
}

/**
 * Fungsi untuk menghilangkan duplikat berdasarkan kunci unik: Tanggal Kunjungan + No.RM.
 */
function deduplicateData(data) {
  const seen = new Set();
  const result = [];
  for (const item of data) {
    const tgl = item["Tanggal Kunjungan"] ? item["Tanggal Kunjungan"].trim() : "";
    const noRM = item["No.RM"] ? item["No.RM"].trim() : "";
    const uniqueKey = `${tgl}_${noRM}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      result.push(item);
    }
  }
  return result;
}

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db();

    // Terima query parameter: tanggal (YYYY-MM-DD) atau month (YYYY-MM)
    const { tanggal, month } = req.query;
    let query = {};
    if (tanggal) {
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }

    // Ambil data dari MongoDB Atlas
    const mongoData = await db.collection('Data Pasien').find(query).toArray();

    // Ambil data dari SEMUA sheet di Google Sheets
    const sheetData = await getAllSheetsData({ tanggal, month });

    // Gabungkan data dari kedua sumber
    let combinedData = [...mongoData, ...sheetData];

    // Lakukan deduplikasi
    combinedData = deduplicateData(combinedData);

    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
