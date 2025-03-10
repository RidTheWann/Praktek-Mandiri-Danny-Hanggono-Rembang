import { google } from 'googleapis';
import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Validasi environment variables
if (!mongodbUri) throw new Error("MONGODB_URI environment variable not set.");
if (!spreadsheetId) throw new Error("SPREADSHEET_ID environment variable not set.");
if (!process.env.GOOGLE_CREDENTIALS) throw new Error("GOOGLE_CREDENTIALS environment variable not set.");

const client = new MongoClient(mongodbUri);

// Mapping bulan Indonesia
const bulanIndo = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember'
};

async function getGoogleSheetData(queryParams) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const range = 'Sheet1!A1:N'; // Range sampai kolom N
    
    const { data } = await sheets.spreadsheets.values.get({ 
      spreadsheetId, 
      range 
    });
    
    const rows = data.values || [];

    if (rows.length === 0) return [];

    // Konversi ke object dengan format bulan Indonesia
    const [header, ...values] = rows;
    return values.map(row => {
      const obj = header.reduce((acc, key, idx) => {
        acc[key] = row[idx] || '';
        return acc;
      }, {});

      // Tambahkan field Bulan Tahun
      if(obj["Tanggal Kunjungan"]) {
        const [tahun, bulan] = obj["Tanggal Kunjungan"].split('-');
        obj["Bulan Tahun"] = `${bulanIndo[bulan]} ${tahun}`;
      }
      
      return obj;
    });
  } catch (error) {
    console.error("Error fetching Google Sheets data:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db();

    // Handle query parameter bulanTahun (contoh: "Maret 2025")
    const { bulanTahun } = req.query;
    let dateFilter = {};

    // Konversi bulanTahun ke regex
    if (bulanTahun) {
      const [bulan, tahun] = bulanTahun.split(' ');
      const bulanNumber = Object.keys(bulanIndo).find(
        key => bulanIndo[key] === bulan
      );
      
      if (!bulanNumber || !tahun) {
        return res.status(400).json({
          status: 'error',
          message: 'Format bulanTahun tidak valid. Gunakan format "Bulan Tahun" contoh: "Maret 2025"'
        });
      }
      
      dateFilter["Tanggal Kunjungan"] = new RegExp(`^${tahun}-${bulanNumber}`);
    }

    // Ambil data dari MongoDB
    const mongoData = await db.collection('Data Pasien')
      .find(dateFilter)
      .toArray();

    // Normalisasi data MongoDB
    const normalizedMongoData = mongoData.map(doc => ({
      ...doc,
      _id: doc._id.toString(),
      "Bulan Tahun": bulanTahun // Tambahkan field untuk konsistensi
    }));

    // Ambil data dari Google Sheets
    const sheetData = await getGoogleSheetData(req.query);
    
    // Filter data Sheets berdasarkan bulanTahun
    const filteredSheetData = bulanTahun 
      ? sheetData.filter(item => item["Bulan Tahun"] === bulanTahun)
      : sheetData;

    // Gabungkan hasil
    const combinedData = [...normalizedMongoData, ...filteredSheetData];

    res.status(200).json({ 
      status: 'success',
      data: combinedData,
      total: combinedData.length
    });
    
  } catch (error) {
    console.error("Error in handler:", {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    res.status(500).json({ 
      status: 'error',
      message: error.message || 'Terjadi kesalahan server',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}