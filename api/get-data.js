import { MongoClient, ObjectId } from 'mongodb';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uri = process.env.MONGODB_URI;
const spreadsheetId = '1Ixd2BhZKvvPRu0XcngLK7jF_TrHcuVXSLcWyuiTsOLU';

if (!uri) {
    throw new Error("MONGODB_URI environment variable not set.");
}

// Array of month names (in Indonesian and English)
const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export default async function handler(req, res) {
    try {
        const { tanggal, sheet } = req.query;

        if (tanggal) {
            // --- MongoDB Logic ---
            const client = new MongoClient(uri);
            try {
                await client.connect();
                const db = client.db();
                const data = await db.collection('Data Pasien')
                    .find({ "Tanggal Kunjungan": tanggal })
                    .toArray();
                    
                res.status(200).json({ data });
                return; // Penting untuk menghentikan eksekusi
            } finally {
                await client.close();
            }
        } else {
            // --- Google Sheets Logic ---
            const auth = new GoogleAuth({
                keyFile: path.join(__dirname, '../credentials.json'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            
            // Perbaikan autentikasi
            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });

            let sheetNamesToFetch = [];

            if (sheet) {
                if (monthNames.includes(sheet)) {
                    sheetNamesToFetch = [sheet];
                } else {
                    return res.status(400).json({ 
                        status: 'error', 
                        message: 'Nama sheet harus berupa nama bulan' 
                    });
                }
            } else {
                const { data: { sheets: sheetList } } = await sheets.spreadsheets.get({
                    spreadsheetId,
                });
                sheetNamesToFetch = sheetList
                    .map(({ properties }) => properties.title)
                    .filter(title => monthNames.includes(title));
            }

            let allData = [];
            for (const currentSheetName of sheetNamesToFetch) {
                const { data: { values } } = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${currentSheetName}!A1:N`,
                });

                if (!values || values.length === 0) continue;

                const headers = values[0];
                const sheetData = values.slice(1).map(row => {
                    const rowData = {
                        "Tanggal Kunjungan": row[0] || "",
                        "No.Antrean": row[1] || "",
                        "Nama Pasien": row[2] || "",
                        "No.RM": row[3] || "",
                        "Kelamin": row[4] || "",
                        "Biaya": row[5] || "",
                        "Tindakan": [],
                        "Lainnya": row[13] || "",
                        "_id": (row[3] || "NoRM") + "-" + Math.random().toString(36).substring(2, 15),
                        "sheetName": currentSheetName
                    };

                    // Handle tindakan
                    for (let i = 6; i < 13; i++) {
                        if (row[i]) rowData.Tindakan.push(headers[i]);
                    }
                    rowData.Tindakan = rowData.Tindakan.join(", ");

                    return rowData;
                });

                allData = allData.concat(sheetData);
            }

            if (sheet && allData.length === 0) {
                return res.status(404).json({ 
                    status: 'error', 
                    message: `Sheet '${sheet}' tidak ditemukan atau kosong` 
                });
            }

            res.status(200).json({ data: allData });
            return; // Penting untuk menghentikan eksekusi
        }
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message || 'Terjadi kesalahan server' 
        });
    }
}