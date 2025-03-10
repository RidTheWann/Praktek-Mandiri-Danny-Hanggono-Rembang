import { MongoClient, ObjectId } from 'mongodb';
import { google } from 'googleapis';

const mongodbUri = process.env.MONGODB_URI;
const spreadsheetId = process.env.SPREADSHEET_ID;

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}
if (!spreadsheetId) {
  throw new Error("SPREADSHEET_ID environment variable not set.");
}

const client = new MongoClient(mongodbUri);

async function deleteSheetRow(sheetName, rowIndex) {
  const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheetsApi = google.sheets({ version: 'v4', auth });
  // Dapatkan sheetId berdasarkan sheetName
  const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const sheet = metadata.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet dengan nama "${sheetName}" tidak ditemukan.`);
  const sheetId = sheet.properties.sheetId;
  // DeleteDimension menggunakan indeks nol (rowIndex - 1) karena indeks dimulai dari 0.
  const startIndex = rowIndex - 1;
  const endIndex = startIndex + 1;
  const request = {
    spreadsheetId,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex
            }
          }
        }
      ]
    }
  };
  const response = await sheetsApi.spreadsheets.batchUpdate(request);
  return response.data;
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).end();
  }
  try {
    const idToDelete = req.query.index;
    if (!idToDelete) {
      return res.status(400).json({ status: 'error', message: 'ID data harus disertakan.' });
    }
    // Cek apakah idToDelete merupakan ObjectId yang valid (untuk MongoDB)
    if (ObjectId.isValid(idToDelete)) {
      await client.connect();
      const db = client.db();
      const result = await db.collection('Data Pasien').deleteOne({ _id: new ObjectId(idToDelete) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan di MongoDB.' });
      }
      return res.status(200).json({ status: 'success', message: 'Data berhasil dihapus dari MongoDB.' });
    } else {
      // Jika bukan ObjectId, asumsikan idToDelete adalah JSON string dari sheetInfo
      let sheetInfo;
      try {
        sheetInfo = JSON.parse(idToDelete);
      } catch (parseError) {
        throw new Error('Format ID data Google Sheets tidak valid.');
      }
      if (!sheetInfo.sheetName || !sheetInfo.rowIndex) {
        throw new Error('Informasi sheet atau row tidak lengkap.');
      }
      const deletionResponse = await deleteSheetRow(sheetInfo.sheetName, sheetInfo.rowIndex);
      return res.status(200).json({ status: 'success', message: 'Data berhasil dihapus dari Google Sheets.', deletionResponse });
    }
  } catch (error) {
    console.error("Error on DELETE:", error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
