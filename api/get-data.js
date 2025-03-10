import { google } from 'googleapis';
import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Validasi environment variables
if (!mongodbUri) throw new Error("MONGODB_URI environment variable not set.");
if (!spreadsheetId) throw new Error("SPREADSHEET_ID environment variable not set.");
if (!process.env.GOOGLE_CREDENTIALS) throw new Error("GOOGLE_CREDENTIALS environment variable not set.");

const client = new MongoClient(mongodbUri);

async function getGoogleSheetData(queryParams) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const range = 'Sheet1!A1:F'; // Sesuaikan dengan range Anda
    
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = data.values || [];

    if (rows.length === 0) return [];

    // Konversi ke object
    const [header, ...values] = rows;
    return values.map(row => header.reduce((obj, key, idx) => {
      obj[key] = row[idx] || '';
      return obj;
    }, {}));
  } catch (error) {
    console.error("Error fetching Google Sheets data:", error);
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db();

    // Handle query parameters
    const { tanggal, month } = req.query;
    const query = {};
    
    if (tanggal) {
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      query["Tanggal Kunjungan"] = new RegExp(`^${month}`);
    }

    // Ambil data dari MongoDB
    const mongoData = await db.collection('Data Pasien')
      .find(query)
      .toArray();

    // Konversi ObjectId ke string
    const normalizedMongoData = mongoData.map(doc => ({
      ...doc,
      _id: doc._id.toString()
    }));

    // Ambil data dari Google Sheets
    const sheetData = await getGoogleSheetData(req.query);

    // Gabungkan dan kirim response
    res.status(200).json({ 
      data: [...normalizedMongoData, ...sheetData] 
    });
    
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message || 'Gagal mengambil data.' 
    });
  }
}