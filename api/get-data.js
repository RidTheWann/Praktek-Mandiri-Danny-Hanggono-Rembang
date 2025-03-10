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
 * Mengambil data dari SEMUA sheet di Google Sheets (range A1:N).
 * Kolom Obat, Cabut Anak, dll. digabung menjadi kolom "Tindakan".
 * Baris tanpa "Tanggal Kunjungan" di-skip agar tidak muncul data kosong.
 */
async function getAllSheetsData(queryParams) {
  try {
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });

    // Ambil metadata (untuk daftar sheet/tab)
    const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);

    let allData = [];

    for (const sheetName of sheetNames) {
      try {
        // Range sampai kolom N
        const range = `'${sheetName}'!A1:N`;
        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });
        const rows = result.data.values;
        if (!rows || rows.length === 0) continue;

        const header = rows[0];
        // Data mulai baris 2
        let data = rows.slice(1).map((row) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          return obj;
        });

        // Skip baris tanpa "Tanggal Kunjungan"
        data = data.filter(obj => {
          const tgl = (obj["Tanggal Kunjungan"] || "").trim();
          return tgl && tgl !== "-";
        });

        // Gabungkan kolom Obat, Cabut Anak, dll. menjadi "Tindakan"
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
            const val = (obj[field] || "").trim();
            // Jika kolom ini diisi "Yes", "X", atau apapun selain kosong/No, 
            // maka tambahkan field ke array Tindakan.
            if (val && val.toLowerCase() !== "no") {
              arr.push(field);
            }
            // Hapus kolom aslinya agar tidak muncul di final data
            delete obj[field];
          });
          // Gabungkan array menjadi string "Obat, Cabut Anak, ..."
          if (arr.length > 0) {
            obj["Tindakan"] = arr.join(", ");
          }
        });

        allData = allData.concat(data);
      } catch (innerError) {
        console.error(`Error reading sheet "${sheetName}":`, innerError);
      }
    }

    // Filter berdasarkan query params: ?tanggal=... atau ?month=...
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
 * Deduplikasi berdasarkan (Tanggal Kunjungan + No.RM).
 */
function deduplicateData(data) {
  const seen = new Set();
  const result = [];
  for (const item of data) {
    const tgl = (item["Tanggal Kunjungan"] || "").trim();
    const noRM = (item["No.RM"] || "").trim();
    const uniqueKey = `${tgl}_${noRM}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      result.push(item);
    }
  }
  return result;
}

import { MongoClient } from 'mongodb';

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

    // Data MongoDB
    const mongoData = await db.collection('Data Pasien').find(query).toArray();
    // Data Google Sheets
    const sheetData = await getAllSheetsData({ tanggal, month });

    // Gabung & deduplikasi
    let combinedData = [...mongoData, ...sheetData];
    combinedData = deduplicateData(combinedData);

    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
