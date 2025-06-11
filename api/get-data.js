import { MongoClient } from 'mongodb';

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  console.error("Error: MONGODB_URI environment variable not set.");
  throw new Error("MONGODB_URI environment variable not set.");
}

const client = new MongoClient(mongodbUri);

export default async function handler(req, res) {
  console.log("API: get-data handler called.");
  console.log("MONGODB_URI: ", mongodbUri ? "Set" : "Not Set");
  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    console.log("Successfully connected to MongoDB.");
    const db = client.db();
    const { tanggal, month } = req.query;
    console.log("Received query parameters - tanggal:", tanggal, ", month:", month);
    let query = {};
    if (tanggal) {
      query["Tanggal Kunjungan"] = tanggal;
    } else if (month) {
      query["Tanggal Kunjungan"] = { $regex: `^${month}` };
    }
    console.log("Executing query:", query);
    const data = await db.collection('Data Pasien').find(query).toArray();
    console.log(`Found ${data.length} documents.`);
    res.status(200).json({ data });
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
  }
}
