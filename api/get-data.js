import { MongoClient } from 'mongodb';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';

// ---------- Path Configuration ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path ke credentials.json (root folder)
const credentialPath = path.join(__dirname, '../credentials.json');
console.log('Menggunakan credential path:', credentialPath);

// ---------- Google Auth Setup ----------
const fixPrivateKey = (key) => key.replace(/\\n/g, '\n');
const credentials = JSON.parse(readFileSync(credentialPath));
credentials.private_key = fixPrivateKey(credentials.private_key);

const auth = new GoogleAuth({
  credentials,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
  ],
});

// ---------- MongoDB Setup ----------
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI environment variable not set.");

// ---------- Main Handler ----------
export default async function handler(req, res) {
  try {
    console.log('Memproses request:', req.query);
    
    const { tanggal, sheet } = req.query;

    // [1] Handle MongoDB Query
    if (tanggal) {
      const client = new MongoClient(uri, {
        connectTimeoutMS: 3000,
        serverSelectionTimeoutMS: 5000
      });
      
      try {
        await client.connect();
        const data = await client.db()
          .collection('Data Pasien')
          .find({ "Tanggal Kunjungan": tanggal })
          .toArray();
          
        return res.status(200).json({ data });
      } finally {
        await client.close();
      }
    }

    // [2] Handle Google Sheets
    const authClient = await auth.getClient();
    console.log('Berhasil autentikasi sebagai:', credentials.client_email);
    
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // [2a] Validasi nama sheet
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni",
                       "Juli","Agustus","September","Oktober","November","Desember"];
    
    let sheetNames = [];
    if (sheet) {
      if (!monthNames.includes(sheet)) {
        return res.status(400).json({ error: 'Nama sheet harus bulan dalam bahasa Indonesia' });
      }
      sheetNames = [sheet];
    } else {
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title'
      });
      sheetNames = res.data.sheets
        .map(s => s.properties.title)
        .filter(name => monthNames.includes(name));
    }

    // [2b] Ambil data dari semua sheet
    let allData = [];
    for (const sheetName of sheetNames) {
      try {
        console.log('Memproses sheet:', sheetName);
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A1:N`,
          valueRenderOption: 'UNFORMATTED_VALUE',
        });

        const rows = res.data.values || [];
        if (rows.length < 2) continue;

        const headers = rows[0];
        const sheetData = rows.slice(1).map(row => ({
          _id: `${row[3] || ''}-${Math.random().toString(36).substr(2, 9)}`,
          tanggal: row[0] || '',
          antrean: row[1] || '',
          nama: row[2] || '',
          rm: row[3] || '',
          kelamin: row[4] || '',
          biaya: row[5] || '',
          tindakan: headers.slice(6,13).filter((_, i) => row[6+i]),
          lainnya: row[13] || '',
          sheetName
        }));

        allData.push(...sheetData);
      } catch (error) {
        console.error(`Gagal memproses sheet ${sheetName}:`, error.message);
      }
    }

    return res.status(200).json({ data: allData });

  } catch (error) {
    console.error('Error utama:', {
      message: error.message,
      stack: error.stack,
      credentialPath,
      clientEmail: credentials.client_email
    });
    
    return res.status(500).json({
      error: process.env.NODE_ENV === 'production' 
        ? 'Terjadi kesalahan server' 
        : `ERROR: ${error.message} (Service Account: ${credentials.client_email})`
    });
  }
}