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
 * Fungsi untuk mengambil data dari SEMUA sheet (tab) di dalam satu spreadsheet,
 * lalu menggabungkan kolom-kolom tindakan (jika perlu) dan melewati baris kosong.
 */
async function getAllSheetsData(queryParams) {
  try {
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });

    // 1. Ambil metadata spreadsheet (untuk daftar sheet/tab).
    const metadata = await sheetsApi.spreadsheets.get({
      spreadsheetId,
    });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title); // array nama sheet

    let allData = [];

    // 2. Iterasi setiap sheet
    for (const sheetName of sheetNames) {
      try {
        // Ubah A1:N sesuai jumlah kolom di Google Sheets Anda.
        // Gunakan tanda kutip tunggal jika ada spasi di nama sheet.
        const range = `'${sheetName}'!A1:N`;

        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const rows = result.data.values;
        if (!rows || rows.length === 0) {
          // Sheet kosong atau tidak ada data
          continue;
        }

        // Baris pertama dianggap header
        const header = rows[0];
        let data = rows.slice(1).map((row) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          return obj;
        });

        // (1) Skip baris yang Tanggal Kunjungannya kosong agar tidak muncul baris "-"
        data = data.filter(obj => obj["Tanggal Kunjungan"]);

        // (2) Jika Anda menyimpan kolom tindakan terpisah (misalnya "Obat", "Cabut Anak", dll.),
        //     gabungkan jadi satu field "Tindakan". Jika sheet Anda sudah punya kolom "Tindakan",
        //     bagian ini bisa dilewati.
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
        });

        // Gabungkan data sheet ini ke allData
        allData = allData.concat(data);

      } catch (innerError) {
        console.error(`Error reading sheet "${sheetName}":`, innerError);
      }
    }

    // 3. Filter data berdasarkan queryParams (tanggal atau month)
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
 * Fungsi untuk menghilangkan duplikat dari data gabungan.
 * Kita menggunakan kombinasi "Tanggal Kunjungan" dan "No.RM" sebagai kunci unik.
 */
function deduplicateData(data) {
  const seen = new Set();
  const result = [];

  for (const item of data) {
    // Pastikan kedua field sudah di-trim untuk menghindari perbedaan spasi.
    const tanggal = item["Tanggal Kunjungan"] ? item["Tanggal Kunjungan"].trim() : "";
    const noRM = item["No.RM"] ? item["No.RM"].trim() : "";
    const uniqueKey = `${tanggal}_${noRM}`;
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

    // Lakukan deduplikasi untuk menghindari data double
    combinedData = deduplicateData(combinedData);

    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
