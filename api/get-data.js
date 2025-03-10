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
 * Fungsi untuk mengambil data dari Google Sheets.
 * Query parameter (tanggal atau month) akan digunakan untuk memfilter data.
 */
async function getGoogleSheetData(queryParams) {
  try {
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    // Pastikan range ini sesuai dengan data di Google Sheets Anda.
    const range = 'Sheet1!A1:F';
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = result.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    // Asumsikan baris pertama adalah header
    const header = rows[0];
    let data = rows.slice(1).map((row) => {
      const obj = {};
      header.forEach((colName, i) => {
        obj[colName] = row[i] || "";
      });
      return obj;
    });

    // Filter data jika ada query parameter tanggal atau month
    const { tanggal, month } = queryParams;
    if (tanggal) {
      data = data.filter(item => item["Tanggal Kunjungan"] === tanggal);
    } else if (month) {
      data = data.filter(item => item["Tanggal Kunjungan"] && item["Tanggal Kunjungan"].startsWith(month));
    }
    return data;
  } catch (error) {
    console.error("Error fetching Google Sheets data:", error);
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
      // Gunakan regex untuk mencocokkan awalan, misal "2025-03"
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }

    // Ambil data dari MongoDB Atlas
    const mongoData = await db.collection('Data Pasien').find(query).toArray();

    // Ambil data dari Google Sheets
    const sheetData = await getGoogleSheetData({ tanggal, month });

    // Gabungkan data dari kedua sumber
    const combinedData = [...mongoData, ...sheetData];

    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
  // Client tidak perlu di-close di Vercel Serverless Functions.
}
