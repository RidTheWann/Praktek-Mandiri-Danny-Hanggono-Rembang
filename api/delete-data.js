import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGODB_URI environment variable not set.");
}
const client = new MongoClient(uri);

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).setHeader('Allow', 'DELETE').end(); // Method Not Allowed
    }
    try {
        await client.connect();
        const db = client.db();
        const idToDelete = req.query.index; // Ambil ID dari query parameter 'index'

        if (!idToDelete) {
            return res.status(400).json({ status: 'error', message: 'ID data harus disertakan.' });
        }

        const result = await db.collection('Data Pasien').deleteOne({ _id: new ObjectId(idToDelete) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan.' });
        }

        res.status(200).json({ status: 'success', message: 'Data berhasil dihapus' }); // Atau 204 No Content

    } catch (error) {
        console.error("Error on DELETE:", error);
        res.status(500).json({ message: error.message });

    }
    // Tidak perlu client.close() di Vercel Serverless Functions
}