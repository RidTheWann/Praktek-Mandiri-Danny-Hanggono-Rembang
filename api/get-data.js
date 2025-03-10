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
 * Kolom Obat, Cabut Anak, Cabut Dewasa, Tambal Sementara, Tambal Tetap, Scaling, dan Rujuk
 * digabung menjadi satu kolom "Tindakan". Setiap baris juga diberi properti `sheetInfo`
 * untuk penghapusan di Google Sheets.
 * Baris tanpa "Tanggal Kunjungan" valid akan di-skip.
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
        // Gunakan range A1:N untuk mengambil seluruh kolom yang diperlukan.
        const range = `'${sheetName}'!A1:N`;
        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });
        const rows = result.data.values;
        if (!rows || rows.length === 0) continue;

        const header = rows[0];
        // Data mulai dari baris ke-2; tambahkan properti sheetInfo (rowIndex disesuaikan: +2, karena baris 1 adalah header)
        let data = rows.slice(1).map((row, index) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          obj.sheetInfo = JSON.stringify({ sheetName, rowIndex: index + 2 });
          return obj;
        });

        // Skip baris jika "Tanggal Kunjungan" kosong atau hanya "-"
        data = data.filter(obj => {
          const tgl = (obj["Tanggal Kunjungan"] || "").trim();
          return tgl && tgl !== "-";
        });

        // Gabungkan kolom-kolom tindakan menjadi satu kolom "Tindakan"
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
            if (val && val.toLowerCase() !== "no") {
              arr.push(field);
            }
            // Hapus kolom aslinya agar tidak muncul di data final
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

    // Filter berdasarkan query parameter ?tanggal=... atau ?month=...
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
 * Deduplikasi data berdasarkan kombinasi "Tanggal Kunjungan" dan "No.RM".
 * Jika "No.RM" kosong, maka hanya "Tanggal Kunjungan" yang digunakan sebagai kunci.
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
    // Ambil data dari MongoDB
    const mongoData = await db.collection('Data Pasien').find(query).toArray();
    // Ambil data dari Google Sheets
    const sheetData = await getAllSheetsData({ tanggal, month });
    // Gabungkan dan deduplikasi
    let combinedData = [...mongoData, ...sheetData];
    combinedData = deduplicateData(combinedData);
    res.status(200).json({ data: combinedData });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
