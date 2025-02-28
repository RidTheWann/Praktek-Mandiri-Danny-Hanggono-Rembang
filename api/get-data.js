import { MongoClient, ObjectId } from 'mongodb';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uri = process.env.MONGODB_URI;
const spreadsheetId = '1Ixd2BhZKvvPRu0XcngLK7jF_TrHcuVXSLcWyuiTsOLU'; // Your Spreadsheet ID

if (!uri) {
    throw new Error("MONGODB_URI environment variable not set.");
}

const client = new MongoClient(uri);

// Array of month names (in Indonesian, and in English for fallback)
const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export default async function handler(req, res) {
    try {
        await client.connect();
        const db = client.db();
        const tanggal = req.query.tanggal;
        const sheetName = req.query.sheet; // Get sheet name, if provided

        if (tanggal) {
            // --- MongoDB Logic (Filter by Date) ---
            let query = { "Tanggal Kunjungan": tanggal };
            const data = await db.collection('Data Pasien').find(query).toArray();
            res.status(200).json({ data });

        } else {
            // --- Google Sheets Logic ---
            const auth = new GoogleAuth({
                keyFile: path.join(__dirname, '../credentials.json'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            const sheets = google.sheets({ version: 'v4', auth });

            let sheetNamesToFetch = [];

            if (sheetName) {
                // If a specific sheet name is provided, *validate* that it's a month name.
                if (monthNames.includes(sheetName)) {
                    sheetNamesToFetch = [sheetName];
                } else {
                  return res.status(400).json({ status: 'error', message: 'Nama sheet tidak valid. Harus nama bulan.' });
                }
            } else {
                // Get sheet names from spreadsheet metadata
                const spreadsheetMeta = await sheets.spreadsheets.get({
                    spreadsheetId,
                });
              // *Filter* the sheet names to include only those that are month names.
              sheetNamesToFetch = spreadsheetMeta.data.sheets
              .map(sheet => sheet.properties.title)
              .filter(title => monthNames.includes(title)); //  Filter here!

            }



            let allData = [];

            for (const currentSheetName of sheetNamesToFetch) {
                const range = `${currentSheetName}!A1:N`; //  A1:N covers all your columns

                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range,
                });

                const values = response.data.values;
                if (!values || values.length === 0) {
                    // If sheet is empty, skip to the next sheet
                    continue;
                }

            // --- Data Transformation ---
            const headers = values[0];
            let sheetData = values.slice(1).map((row) => {
                const rowData = {};

                // Handle main fields (Tanggal Kunjungan, No. Antrean, Nama Pasien, No.RM, Kelamin, Biaya)
                rowData["Tanggal Kunjungan"] = row[0] || "";
                rowData["No.Antrean"] = row[1] || "";
                rowData["Nama Pasien"] = row[2] || "";
                rowData["No.RM"] = row[3] || "";
                rowData["Kelamin"] = row[4] || "";
                rowData["Biaya"] = row[5] || "";


                // --- Tindakan (Concatenate) ---
                const tindakanArray = [];
                const tindakanHeaders = ["Obat", "Cabut anak", "Cabut dewasa", "Tambal Sementara", "Tambal Tetap", "Scaling", "Rujuk"];
                for (let i = 6; i < 13; i++) { // Columns G (index 6) to M (index 12)
                    if (row[i]) { // If the cell is not empty
                        tindakanArray.push(headers[i]); // Add the *header* (action name)
                    }
                }
                rowData["Tindakan"] = tindakanArray.join(", "); // Join with comma and space

                rowData["Lainnya"] = row[13] || ""; // Column N (index 13)

                // Create a unique _id.  Using No.RM + random string to ensure uniqueness.
                rowData._id = (rowData["No.RM"] || "NoRM") + "-" + Math.random().toString(36).substring(2, 15);

                return rowData;
            });
                // Add sheet name (optional, but useful)
                sheetData.forEach(item => item.sheetName = currentSheetName);
                allData = allData.concat(sheetData);
            }
            // If the request included a specific sheet name, and no data was found:
            if (sheetName && allData.length === 0) {
                return res.status(404).json({ status: 'error', message: `Sheet '${sheetName}' tidak ditemukan atau kosong.` });
            }

            res.status(200).json({ data: allData });
        }
    } catch (error) {
        console.error("Error accessing Google Sheets API:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data dari Google Sheets.', error: error.message });
    }
    // No client.close() needed in Vercel
}