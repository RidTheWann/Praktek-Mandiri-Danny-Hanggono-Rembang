import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI environment variable not set.");
}

const client = new MongoClient(uri);

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db(); // Ambil object database

    // Terima query parameter: tanggal (YYYY-MM-DD) atau month (YYYY-MM)
    const { tanggal, month } = req.query;
    let query = {};
    
    if (tanggal) {
      // Filter data berdasarkan tanggal lengkap
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      // Filter data berdasarkan awalan tanggal (contoh: "2025-03" akan cocok dengan "2025-03-10")
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }

    const data = await db.collection('Data Pasien').find(query).toArray();
    res.status(200).json({ data });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
  // Tidak perlu client.close() di Vercel Serverless Functions
}
