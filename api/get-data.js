import { google } from 'googleapis';
import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Pastikan environment variable berikut sudah diset di Vercel:
// 1) MONGODB_URI         -> URI MongoDB Atlas
// 2) SPREADSHEET_ID      -> ID dokumen Google Sheets
// 3) GOOGLE_CREDENTIALS  -> File JSON service account (dalam satu baris)

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}
if (!spreadsheetId) {
  throw new Error("SPREADSHEET_ID environment variable not set.");
}

const client = new MongoClient(mongodbUri);

/** 
 * Fungsi untuk mengambil data dari Google Sheets 
 * dan mengembalikannya dalam bentuk array of objects.
 */
async function getGoogleSheetData(queryParams) {
  // Parse kredensial dari environment variable
  const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  // Inisialisasi GoogleAuth
  const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  // Buat client Google Sheets
  const sheets = google.sheets({ version: 'v4', auth });

  // Tentukan range data di spreadsheet (sesuaikan dengan sheet Anda)
  // Misalnya, "Sheet1!A1:F" jika kolom sampai F (Tanggal Kunjungan, Nama Pasien, dll.)
  const range = 'Sheet1!A1:F';

  // Ambil data dari Google Sheets
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = result.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Anggap baris pertama adalah header
  const header = rows[0];
  let data = rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((colName, i) => {
      obj[colName] = row[i] || "";
    });
    return obj;
  });

  // Filter data jika ada parameter tanggal atau month
  // Kolom di Google Sheets juga bernama "Tanggal Kunjungan" (format YYYY-MM-DD)
  const { tanggal, month } = queryParams;
  if (tanggal) {
    // Filter data berdasarkan tanggal lengkap (YYYY-MM-DD)
    data = data.filter(item => item["Tanggal Kunjungan"] === tanggal);
  } else if (month) {
    // Filter data berdasarkan awalan tanggal, misal "2025-03"
    data = data.filter(item => {
      return item["Tanggal Kunjungan"] && item["Tanggal Kunjungan"].startsWith(month);
    });
  }

  return data;
}

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db();

    // Terima query parameter: tanggal (YYYY-MM-DD) atau month (YYYY-MM)
    const { tanggal, month } = req.query;

    // -----------------------------------
    // 1. Ambil data dari MongoDB Atlas
    // -----------------------------------
    let query = {};
    if (tanggal) {
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      // Contoh filter "2025-03" => cocokkan dokumen "Tanggal Kunjungan" yang diawali 2025-03
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }

    const mongoData = await db.collection('Data Pasien').find(query).toArray();

    // -----------------------------------
    // 2. Ambil data dari Google Sheets
    // -----------------------------------
    const sheetData = await getGoogleSheetData({ tanggal, month });

    // -----------------------------------
    // 3. Gabungkan data (opsional)
    // -----------------------------------
    // Jika Anda hanya butuh data Google Sheets, gunakan `sheetData`.
    // Jika hanya butuh data Mongo, gunakan `mongoData`.
    // Jika keduanya, gabungkan:
    const combinedData = [...mongoData, ...sheetData];

    // Return data
    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
  // Tidak perlu client.close() di Vercel Serverless Functions
}
