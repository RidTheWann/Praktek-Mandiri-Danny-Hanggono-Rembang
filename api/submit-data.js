import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGODB_URI environment variable not set.");
}

const client = new MongoClient(uri);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).setHeader('Allow', 'POST').end(); // Method Not Allowed
    }

    try {
        await client.connect();
        const db = client.db();

        const newData = req.body;

        if (!newData["Tanggal Kunjungan"] || !newData["Nama Pasien"] || !newData["No.RM"]) {
            return res.status(400).json({ status: 'error', message: 'Data tidak lengkap.' });
        }

        const result = await db.collection('Data Pasien').insertOne(newData);
        const insertedData = { ...newData, _id: result.insertedId };
        res.status(201).json({ status: 'success', message: 'Berhasil simpan data', data: insertedData });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
    // Tidak perlu client.close() di Vercel Serverless Functions
}