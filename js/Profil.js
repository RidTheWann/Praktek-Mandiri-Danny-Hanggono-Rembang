
AOS.init({
    duration: 1000,
    once: true
});

// Tombol kembali ke halaman sebelumnya
document.getElementById('backBtn').addEventListener('click', function() {
    window.history.back();
});