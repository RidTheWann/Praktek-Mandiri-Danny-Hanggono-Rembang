import { MongoClient, ObjectId } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}

// Buat instance MongoClient sekali saja
const client = new MongoClient(mongodbUri);
let cachedDb = null;

// Fungsi untuk meng-cache koneksi ke MongoDB
async function connectToDB() {
  if (cachedDb) {
    return cachedDb;
  }
  await client.connect();
  cachedDb = client.db();
  return cachedDb;
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
    if (!ObjectId.isValid(idToDelete)) {
      return res.status(400).json({ status: 'error', message: 'ID data tidak valid.' });
    }
    const db = await connectToDB();
    const result = await db.collection('Data Pasien').deleteOne({ _id: new ObjectId(idToDelete) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan.' });
    }
    return res.status(200).json({ status: 'success', message: 'Data berhasil dihapus dari MongoDB.' });
  } catch (error) {
    console.error("Error on DELETE:", error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
