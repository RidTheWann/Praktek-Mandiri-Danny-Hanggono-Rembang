// scripts/export-sheets-to-mongo.js
import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const mongodbUri = process.env.MONGODB_URI;
const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

if (!spreadsheetId || !mongodbUri || !googleCredentials) {
  throw new Error("Pastikan SPREADSHEET_ID, MONGODB_URI, dan GOOGLE_CREDENTIALS sudah di-set.");
}

// Regex untuk mendeteksi nama sheet, mis. "Januari 2025", "Februari 2025", dll.
const bulanRegex = /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/i;

// Kolom tindakan yang mau digabung ke satu field "Tindakan"
const tindakanFields = [
  "Obat",
  "Cabut Anak",
  "Cabut Dewasa",
  "Tambal Sementara",
  "Tambal Tetap",
  "Scaling",
  "Rujuk"
];

/**
 * Ambil data dari semua sheet yang namanya mengandung bulan + tahun (regex di atas),
 * filter baris dengan "Tanggal Kunjungan" valid, gabung kolom tindakan, 
 * lalu hasilkan array dokumen final dengan field:
 *  - "Tanggal Kunjungan"
 *  - "Nama Pasien"
 *  - "No.RM"
 *  - "Kelamin"
 *  - "Tindakan"
 *  - "Biaya"
 *  - "Lainnya"
 */
async function fetchSheetsData() {
  const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheetsApi = google.sheets({ version: 'v4', auth });

  // Ambil metadata untuk semua sheet
  const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const allSheetNames = metadata.data.sheets.map(s => s.properties.title);

  // Filter hanya sheet yang cocok nama bulan + tahun
  const filteredSheetNames = allSheetNames.filter(name => bulanRegex.test(name));
  console.log("Sheet yang terdeteksi:", filteredSheetNames);

  let allData = [];

  for (const sheetName of filteredSheetNames) {
    try {
      // Ambil data range A1:N (sesuaikan jika kolom Anda lebih/kurang)
      const range = `'${sheetName}'!A1:N`;
      const result = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      const rows = result.data.values;
      if (!rows || rows.length === 0) continue;

      const header = rows[0];
      // Data mulai baris ke-2
      let data = rows.slice(1).map((row, index) => {
        const doc = {};
        header.forEach((colName, i) => {
          doc[colName] = row[i] || "";
        });
        // sheetInfo (jika mau, tapi kita akan hapus nanti)
        doc.sheetInfo = JSON.stringify({
          sheetName,
          rowIndex: index + 2
        });
        return doc;
      });

      // Filter baris:
      // 1) "Tanggal Kunjungan" valid format YYYY-MM-DD & day != "00"
      // 2) "Nama Pasien" tidak kosong (opsional)
      data = data.filter(doc => {
        const tgl = (doc["Tanggal Kunjungan"] || "").trim();
        if (!tgl || tgl === "-") return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return false;
        const [yyyy, mm, dd] = tgl.split("-");
        if (dd === "00") return false;

        const nama = (doc["Nama Pasien"] || "").trim();
        if (!nama) return false;

        return true;
      });

      // Gabungkan kolom tindakan -> doc["Tindakan"]
      data.forEach(doc => {
        let arr = [];
        tindakanFields.forEach(field => {
          const val = (doc[field] || "").trim();
          if (val && val.toLowerCase() !== "no") {
            if (val.toLowerCase() === "yes" || val.toLowerCase() === "ya") {
              arr.push(field);
            } else {
              arr.push(`${field} (${val})`);
            }
          }
          // Hapus field asli
          delete doc[field];
        });

        // Buat doc["Tindakan"]
        doc["Tindakan"] = arr.join(", ");

        // Hapus sheetInfo jika tidak mau disimpan
        delete doc.sheetInfo;
      });

      // Buat array newData dengan field persis (Tanggal Kunjungan, Nama Pasien, No.RM, Kelamin, Tindakan, Biaya, Lainnya)
      const newData = data.map(doc => {
        return {
          "Tanggal Kunjungan": doc["Tanggal Kunjungan"] || "",
          "Nama Pasien": doc["Nama Pasien"] || "",
          "No.RM": doc["No.RM"] || "",
          "Kelamin": doc["Kelamin"] || "",
          "Tindakan": doc["Tindakan"] || "",
          "Biaya": doc["Biaya"] || "",
          "Lainnya": doc["Lainnya"] || ""
        };
      });

      // Gabung ke allData
      allData = allData.concat(newData);
    } catch (err) {
      console.error(`Error reading sheet "${sheetName}":`, err);
    }
  }

  return allData;
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

// Insert ke collection "Data Pasien"
async function exportToMongoDB(data) {
  const client = new MongoClient(mongodbUri);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection("Data Pasien");

    // (Opsional) Hapus data lama:
    // await collection.deleteMany({});

    const result = await collection.insertMany(data);
    console.log(`Berhasil menginsert ${result.insertedCount} dokumen ke "Data Pasien".`);
  } catch (err) {
    console.error("Error inserting to MongoDB:", err);
  } finally {
    await client.close();
  }
}

async function main() {
  try {
    const sheetsData = await fetchSheetsData();
    if (sheetsData.length === 0) {
      console.log("Tidak ada data yang ditemukan di Google Sheets.");
      return;
    }
    // Deduplikasi
    const finalData = deduplicateData(sheetsData);
    // Insert ke MongoDB
    await exportToMongoDB(finalData);
  } catch (error) {
    console.error("Error during export:", error);
  }
}

main();
