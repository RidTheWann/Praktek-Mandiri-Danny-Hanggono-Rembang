import { google } from 'googleapis';
import { MongoClient, ObjectId } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}
if (!spreadsheetId) {
  throw new Error("SPREADSHEET_ID environment variable not set.");
}

// Hanya satu deklarasi MongoClient
const client = new MongoClient(mongodbUri);

/**
 * Mengambil data dari SEMUA sheet di Google Sheets (range A1:N).
 * - Setiap baris diberi properti `sheetInfo` (JSON) agar bisa dihapus dari Sheets (jika Anda implementasikan di delete-data.js).
 * - Baris tanpa "Tanggal Kunjungan" valid di-skip (termasuk format aneh seperti "2025-08-00").
 * - Baris yang hanya punya tanggal tetapi "Nama Pasien" kosong juga di-skip (mencegah baris misterius).
 * - Kolom Obat, Cabut Anak, dll. digabung menjadi satu kolom "Tindakan".
 */
async function getAllSheetsData(queryParams) {
  try {
    // Autentikasi Google
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });

    // Ambil metadata (daftar sheet)
    const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);

    let allData = [];

    for (const sheetName of sheetNames) {
      try {
        // Range sampai kolom N (A1:N)
        const range = `'${sheetName}'!A1:N`;
        const result = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range,
        });
        const rows = result.data.values;
        if (!rows || rows.length === 0) continue;

        const header = rows[0];
        // Data mulai baris 2
        let data = rows.slice(1).map((row, index) => {
          const obj = {};
          header.forEach((colName, i) => {
            obj[colName] = row[i] || "";
          });
          // Tambahkan sheetInfo (opsional) untuk penghapusan di Sheets
          obj.sheetInfo = JSON.stringify({
            sheetName,
            rowIndex: index + 2, // +2 karena baris 1 = header
          });
          return obj;
        });

        // Filter baris tanpa "Tanggal Kunjungan" valid
        data = data.filter(obj => {
          const tgl = (obj["Tanggal Kunjungan"] || "").trim();
          // 1) Pastikan tidak kosong atau "-"
          if (!tgl || tgl === "-") return false;
          // 2) Pastikan format YYYY-MM-DD (regex)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return false;
          // 3) Cek day bukan "00"
          const [yyyy, mm, dd] = tgl.split("-");
          if (dd === "00") return false;

          // **Filter tambahan**: Pastikan kolom "Nama Pasien" tidak kosong
          const nama = (obj["Nama Pasien"] || "").trim();
          if (!nama) return false;

          return true;
        });

        // Gabungkan kolom-kolom tindakan jadi satu kolom "Tindakan"
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
            // Hapus kolom aslinya
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

    // Filter ?tanggal=YYYY-MM-DD atau ?month=YYYY-MM
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
 * Jika No.RM kosong, maka kunci unik hanya berdasarkan tanggal.
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

    // Data dari MongoDB
    const mongoData = await db.collection('Data Pasien').find(query).toArray();

    // Data dari Google Sheets
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
