import { MongoClient } from 'mongodb';
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

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// Validasi struktur row data
const validateRow = (row, headers) => {
    const paddedRow = Array.isArray(row) ? [...row] : [];
    while(paddedRow.length < 14) paddedRow.push('');
    
    return {
        tanggal: paddedRow[0] || "",
        antrean: paddedRow[1] || "",
        nama: paddedRow[2] || "",
        rm: paddedRow[3] || "",
        kelamin: paddedRow[4] || "",
        biaya: paddedRow[5] || "",
        tindakan: headers.slice(6, 13).filter((_, i) => paddedRow[6 + i]),
        lainnya: paddedRow[13] || "",
    };
};

export default async function handler(req, res) {
    try {
        console.log(`Request received: ${req.method} ${req.url}`);
        
        const { tanggal, sheet } = req.query;
        
        if (tanggal) {
            const client = new MongoClient(uri, {
                connectTimeoutMS: 3000,
                serverSelectionTimeoutMS: 5000
            });
            
            try {
                await client.connect();
                const db = client.db();
                console.log(`Querying MongoDB for date: ${tanggal}`);
                
                const data = await db.collection('Data Pasien')
                    .find({ "Tanggal Kunjungan": tanggal })
                    .project({ _id: 0 })
                    .toArray();
                
                return res.status(200).json({ data });
            } finally {
                await client.close();
            }
        }

        // Google Sheets Logic
        const auth = new GoogleAuth({
            keyFile: path.join(__dirname, './credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const authClient = await auth.getClient();
        if (!authClient) {
            throw new Error('Google authentication failed');
        }

        const sheets = google.sheets({ version: 'v4', auth: authClient });
        let sheetNamesToFetch = [];

        if (sheet) {
            if (!monthNames.includes(sheet)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Nama sheet harus berupa nama bulan'
                });
            }
            sheetNamesToFetch = [sheet];
        } else {
            const { data: { sheets: sheetList } } = await sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'sheets.properties.title'
            });
            
            sheetNamesToFetch = sheetList
                .map(({ properties }) => properties.title)
                .filter(title => monthNames.includes(title));
        }

        if (sheetNamesToFetch.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Tidak ditemukan sheet yang valid'
            });
        }

        const allData = [];
        for (const sheetName of sheetNamesToFetch) {
            try {
                const { data: { values } } = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${sheetName}!A1:N`,
                    valueRenderOption: 'UNFORMATTED_VALUE',
                });

                if (!values || values.length < 2) {
                    console.log(`Sheet ${sheetName} kosong`);
                    continue;
                }

                const [headers, ...rows] = values;
                const sheetData = rows.map(row => {
                    const { tanggal, antrean, nama, rm, kelamin, biaya, tindakan, lainnya } = validateRow(row, headers);
                    
                    return {
                        "Tanggal Kunjungan": tanggal,
                        "No.Antrean": antrean,
                        "Nama Pasien": nama,
                        "No.RM": rm,
                        "Kelamin": kelamin,
                        "Biaya": biaya,
                        "Tindakan": tindakan.join(", "),
                        "Lainnya": lainnya,
                        "_id": `${rm}-${Math.random().toString(36).substr(2, 9)}`,
                        "sheetName": sheetName
                    };
                });

                allData.push(...sheetData);
            } catch (error) {
                console.error(`Error processing sheet ${sheetName}:`, error);
                continue;
            }
        }

        if (sheet && allData.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Sheet '${sheet}' tidak mengandung data`
            });
        }

        return res.status(200).json({ data: allData });

    } catch (error) {
        console.error('Server Error:', {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        
        return res.status(500).json({
            status: 'error',
            message: process.env.NODE_ENV === 'production' 
                ? 'Terjadi kesalahan server' 
                : error.message
        });
    }
}