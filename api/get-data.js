import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error("MONGODB_URI environment variable not set.");
}

const client = new MongoClient(mongodbUri);

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
    const data = await db.collection('Data Pasien').find(query).toArray();
    res.status(200).json({ data });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
