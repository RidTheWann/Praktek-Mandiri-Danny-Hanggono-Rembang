const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb'); // Import MongoClient dan ObjectId

const app = express();
const port = process.env.PORT || 3000; // Ambil port dari environment variable (Render), atau gunakan 3000

// --- KONEKSI KE MONGODB ATLAS ---
//  PENTING:  Jangan taruh connection string di sini!  Gunakan environment variable.
const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("ERROR: MONGODB_URI environment variable not set!");
    process.exit(1); // Hentikan aplikasi jika MONGODB_URI tidak di-set.
}

const client = new MongoClient(uri);
let db; // Variabel global untuk database connection (opsional, lihat penjelasan di bawah)

async function connectToMongo() {
    try {
        await client.connect();
        console.log('Terhubung ke MongoDB Atlas');
        db = client.db(); // Ambil object database
        return db; // Kembalikan object db
    } catch (error) {
        console.error('Gagal terhubung ke MongoDB:', error);
        process.exit(1); // Hentikan aplikasi jika koneksi gagal
    }
}



// --- MIDDLEWARE ---
app.use(express.json()); // WAJIB: Untuk parsing body JSON dari request
app.use(cors()); // Izinkan request dari origin yang berbeda (frontend Anda)
app.use(express.static(__dirname)); // Sajikan file statis (HTML, CSS, JS, dll.)

// --- ROUTES ---

// Route untuk halaman utama (index.html).
// Ini *harus* setelah express.static, agar file statis didahulukan.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

//route untuk pages
app.get('/pages/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'dashboard.html'));
});
app.get('/pages/Home', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'Home.html'));
});

app.get('/pages/data-harian', (req, res) => { //tambahkan ini, data-harian ada di root
        res.sendFile(path.join(__dirname,  'data-harian.html'));
});

// API endpoint untuk GET data (dengan filter tanggal opsional)
app.get('/get-data', async (req, res) => {
    try {
        const db = await connectToMongo(); // Dapatkan koneksi DB *dalam* route handler
        const tanggal = req.query.tanggal;
        let query = {};

        if (tanggal) {
            query["Tanggal Kunjungan"] = tanggal;
        }

        const data = await db.collection('Data Pasien').find(query).toArray();
        res.json({ data }); // Kirim data sebagai JSON
    } catch (error) {
        console.error("Error mengambil data:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data dari database.' });
    }
});

// API endpoint untuk POST data (menambahkan data baru)
app.post('/submit-data', async (req, res) => {
    try {
        const db = await connectToMongo(); // Dapatkan koneksi DB
        const newData = req.body;

        // Validasi data (sangat sederhana, tambahkan validasi yang lebih kuat jika perlu)
        if (!newData["Tanggal Kunjungan"] || !newData["Nama Pasien"] || !newData["No.RM"]) {
            return res.status(400).json({ status: 'error', message: 'Data tidak lengkap. Tanggal, nama, dan No. RM harus diisi.' });
        }

        const result = await db.collection('Data Pasien').insertOne(newData);
        const insertedData = { ...newData, _id: result.insertedId }; // Tambahkan _id ke data yang di-return
        res.status(201).json({ status: 'success', message: 'Data berhasil ditambahkan', data: insertedData });
    } catch (error) {
        console.error("Error menambahkan data:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menambahkan data ke database.' });
    }
});

// API endpoint untuk DELETE data (berdasarkan _id)
app.delete('/delete-data', async (req, res) => {
    try {
        const db = await connectToMongo(); //Dapatkan koneksi DB
        const idToDelete = req.query.index;

        if (!idToDelete) {
            return res.status(400).json({ status: 'error', message: 'ID data harus disertakan.' });
        }

        const result = await db.collection('Data Pasien').deleteOne({ _id: new ObjectId(idToDelete) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan.' });
        }

        res.status(200).json({ status: 'success', message: 'Data berhasil dihapus' });
    } catch (error) {
        console.error("Error menghapus data:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus data dari database.' });
    }
});


// --- START SERVER ---
// Pindahkan app.listen ke dalam then() dari connectToMongo()
connectToMongo().then(db => {
    if (db) {
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    }
});