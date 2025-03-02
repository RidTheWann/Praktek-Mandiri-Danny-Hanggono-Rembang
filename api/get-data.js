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

        const tanggal = req.query.tanggal;
        let query = {};
        if (tanggal) {
            query["Tanggal Kunjungan"] = tanggal;
        }

        const data = await db.collection('Data Pasien').find(query).toArray();
        res.status(200).json({ data });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data.' });
    }
    // Tidak perlu client.close() di Vercel Serverless Functions
}