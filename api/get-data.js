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
 * Setiap baris dari Sheets akan diberi properti sheetInfo sebagai JSON string yang berisi
 * { sheetName, rowIndex } agar bisa diidentifikasi untuk penghapusan.
 * Data tidak melewatkan baris dengan kolom No.RM kosong.
 */
async function getAllSheetsData(queryParams) {
  try {
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });
    // Ambil metadata untuk mendapatkan daftar sheet
    const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);
    let allData = [];
    for (const sheetName of sheetNames) {
      try {
        // Misal, range: 'SheetName!A1:N'
        const range = `'${sheetName}'!A1:N`;
        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });
        const rows = result.data.values;
        if (!rows || rows.length === 0) continue;
        const header = rows[0];
        let data = rows.slice(1).map((row, index) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          // Tambahkan properti sheetInfo agar delete-data.js dapat mengenali baris dari Sheets
          obj.sheetInfo = JSON.stringify({ sheetName, rowIndex: index + 2 }); // +2: baris 1 adalah header
          return obj;
        });
        // Hanya skip baris yang tidak memiliki "Tanggal Kunjungan" (untuk menghindari baris kosong)
        data = data.filter(obj => obj["Tanggal Kunjungan"] && obj["Tanggal Kunjungan"].trim() !== "");
        // Jika kolom tindakan disimpan terpisah, gabungkan menjadi satu field "Tindakan".
        const tindakanFields = ["Obat", "Cabut Anak", "Cabut Dewasa", "Tambal Sementara", "Tambal Tetap", "Scaling", "Rujuk"];
        data.forEach(obj => {
          let arr = [];
          tindakanFields.forEach(field => {
            if (obj[field] && obj[field].trim() !== "" && obj[field].toLowerCase() !== "no") {
              arr.push(field);
            }
            delete obj[field];
          });
          if (arr.length > 0) {
            obj["Tindakan"] = arr.join(", ");
          }
        });
        allData = allData.concat(data);
      } catch (innerError) {
        console.error(`Error reading sheet "${sheetName}":`, innerError);
      }
    }
    const { tanggal, month } = queryParams;
    if (tanggal) {
      allData = allData.filter(item => item["Tanggal Kunjungan"] === tanggal);
    } else if (month) {
      allData = allData.filter(item => item["Tanggal Kunjungan"] && item["Tanggal Kunjungan"].startsWith(month));
    }
    return allData;
  } catch (error) {
    console.error("Error fetching multiple sheets data:", error);
    throw error;
  }
}

/**
 * Fungsi deduplikasi berdasarkan kombinasi "Tanggal Kunjungan" dan "No.RM".
 * (Jika nilai No.RM kosong, kunci unik hanya mengandalkan tanggal.)
 */
function deduplicateData(data) {
  const seen = new Set();
  const result = [];
  for (const item of data) {
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
    const { tanggal, month } = req.query;
    let query = {};
    if (tanggal) {
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }
    const mongoData = await db.collection('Data Pasien').find(query).toArray();
    const sheetData = await getAllSheetsData({ tanggal, month });
    let combinedData = [...mongoData, ...sheetData];
    combinedData = deduplicateData(combinedData);
    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
