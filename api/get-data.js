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
    // sheetNames akan berisi array nama sheet, misalnya ["Januari 2025", "Februari 2025", "Maret 2025", ...]
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);

    let allData = [];

    // 2. Iterasi setiap sheet untuk mengambil data
    for (const sheetName of sheetNames) {
      try {
        // Contoh range: 'Januari 2025!A1:N'
        // Gunakan tanda kutip tunggal jika ada spasi di nama sheet
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

        // Baris pertama dianggap sebagai header
        const header = rows[0];
        let data = rows.slice(1).map((row) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          return obj;
        });

        // Gabungkan data sheet ini ke allData
        allData = allData.concat(data);

      } catch (innerError) {
        // Jika ada error pada sheet tertentu, misalnya range tidak valid
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
      // Contoh: "2025-03"
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }

    // Ambil data dari MongoDB Atlas
    const mongoData = await db.collection('Data Pasien').find(query).toArray();

    // Ambil data dari SEMUA sheet di Google Sheets
    const sheetData = await getAllSheetsData({ tanggal, month });

    // Gabungkan data dari kedua sumber
    const combinedData = [...mongoData, ...sheetData];

    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
  // Tidak perlu client.close() di Vercel
}
