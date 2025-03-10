document.addEventListener('DOMContentLoaded', () => {
  const sidebarLinks = document.querySelectorAll('.sidebar a');
  const chartSections = document.querySelectorAll('.chart-section');
  const tableSection = document.getElementById('kunjungan-harian');
  const tabelKunjunganBody = document.querySelector('#tabelKunjungan tbody');
  const backToHomeBtn = document.getElementById('backToHome');
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const filterTanggalInput = document.getElementById('filter-tanggal');

  // Toggle sidebar (mobile)
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  function showSection(sectionId) {
    chartSections.forEach(section => section.classList.remove('active'));
    tableSection.classList.remove('active');
    if (sectionId === 'kunjungan-harian') {
      tableSection.classList.add('active');
    } else {
      const sectionToShow = document.getElementById(sectionId);
      if (sectionToShow) sectionToShow.classList.add('active');
    }
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  }

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.dataset.section;
      showSection(sectionId);
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      if (sectionId.startsWith('total-')) updateCharts(sectionId);
    });
  });

  if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'Home.html';
    });
  }

  let chartPasienHarianInstance = null;
  let chartPasienBulananInstance = null;
  let chartBiayaInstance = null;
  let chartTindakanInstance = null;

  async function updateCharts(sectionId) {
    try {
      const data = await fetchData();
      if (sectionId === 'total-pasien-harian') {
        const { labelsHarian, dataLakiHarian, dataPerempuanHarian } = processDataHarian(data);
        if (chartPasienHarianInstance) chartPasienHarianInstance.destroy();
        chartPasienHarianInstance = createChart('chartPasienHarian', 'bar', labelsHarian, dataLakiHarian, dataPerempuanHarian);
      } else if (sectionId === 'total-pasien-bulanan') {
        const { labelsBulanan, dataLakiBulanan, dataPerempuanBulanan } = processDataBulanan(data);
        if (chartPasienBulananInstance) chartPasienBulananInstance.destroy();
        chartPasienBulananInstance = createChart('chartPasienBulanan', 'bar', labelsBulanan, dataLakiBulanan, dataPerempuanBulanan);
      } else if (sectionId === 'total-biaya') {
        const { labelsBiaya, dataBPJS, dataUmum } = processDataBiaya(data);
        if (chartBiayaInstance) chartBiayaInstance.destroy();
        chartBiayaInstance = createChartBiaya('chartBiaya', labelsBiaya, dataBPJS, dataUmum);
      } else if (sectionId === 'total-tindakan') {
        const { labelsTindakan, dataTindakan } = processDataTindakan(data);
        if (chartTindakanInstance) chartTindakanInstance.destroy();
        chartTindakanInstance = createChartTindakan('chartTindakan', labelsTindakan, dataTindakan);
      }
    } catch (error) {
      console.error("Gagal update chart:", error);
    }
  }

  // ========== PEMROSESAN DATA ==========
  // 1. Data Harian
  function processDataHarian(data) {
    const dailyCounts = {};
    data.forEach(item => {
      let tanggal = (item["Tanggal Kunjungan"] || "").trim();
      if (!tanggal || tanggal === "-") return;
      const kelamin = (item["Kelamin"] || "").trim();
      if (!dailyCounts[tanggal]) {
        dailyCounts[tanggal] = { lakiLaki: 0, perempuan: 0 };
      }
      if (kelamin === "Laki - Laki" || kelamin === "Laki-Laki") {
        dailyCounts[tanggal].lakiLaki++;
      } else if (kelamin === "Perempuan") {
        dailyCounts[tanggal].perempuan++;
      }
    });
    const labelsHarian = Object.keys(dailyCounts);
    const dataLakiHarian = labelsHarian.map(t => dailyCounts[t].lakiLaki);
    const dataPerempuanHarian = labelsHarian.map(t => dailyCounts[t].perempuan);
    return { labelsHarian, dataLakiHarian, dataPerempuanHarian };
  }

  // 2. Data Bulanan
  function processDataBulanan(data) {
    const monthlyCounts = {};
    data.forEach(item => {
      let tanggal = (item["Tanggal Kunjungan"] || "").trim();
      if (!tanggal || tanggal === "-") return;
      const parts = tanggal.split('-');
      if (parts.length < 2) return;
      const [year, month] = parts;
      const monthYear = `${year}-${month}`;
      const kelamin = (item["Kelamin"] || "").trim();
      if (!monthlyCounts[monthYear]) {
        monthlyCounts[monthYear] = { "Laki - Laki": 0, "Perempuan": 0 };
      }
      if (kelamin === "Laki - Laki" || kelamin === "Laki-Laki") {
        monthlyCounts[monthYear]["Laki - Laki"]++;
      } else if (kelamin === "Perempuan") {
        monthlyCounts[monthYear]["Perempuan"]++;
      }
    });
    const labelsBulanan = Object.keys(monthlyCounts);
    const dataLakiBulanan = labelsBulanan.map(m => monthlyCounts[m]["Laki - Laki"]);
    const dataPerempuanBulanan = labelsBulanan.map(m => monthlyCounts[m]["Perempuan"]);
    return { labelsBulanan, dataLakiBulanan, dataPerempuanBulanan };
  }

  // 3. Data Biaya
  function processDataBiaya(data) {
    const biayaCounts = {};
    data.forEach(item => {
      let tanggal = (item["Tanggal Kunjungan"] || "").trim();
      if (!tanggal || tanggal === "-") return;
      const parts = tanggal.split('-');
      if (parts.length < 2) return;
      const [year, month] = parts;
      const monthYear = `${year}-${month}`;
      const biaya = (item["Biaya"] || "").trim();
      if (!biayaCounts[monthYear]) {
        biayaCounts[monthYear] = { BPJS: 0, UMUM: 0 };
      }
      if (biaya === "BPJS") {
        biayaCounts[monthYear].BPJS++;
      } else if (biaya === "UMUM") {
        biayaCounts[monthYear].UMUM++;
      }
    });
    const labelsBiaya = Object.keys(biayaCounts);
    const dataBPJS = labelsBiaya.map(m => biayaCounts[m].BPJS || 0);
    const dataUmum = labelsBiaya.map(m => biayaCounts[m].UMUM || 0);
    return { labelsBiaya, dataBPJS, dataUmum };
  }

  // 4. Data Tindakan (termasuk "Lainnya")
  function processDataTindakan(data) {
    const tindakanCounts = {};
    data.forEach(item => {
      let tanggal = (item["Tanggal Kunjungan"] || "").trim();
      if (!tanggal || tanggal === "-") return;
      const parts = tanggal.split('-');
      if (parts.length < 2) return;
      const [year, month] = parts;
      const monthYear = `${year}-${month}`;
      if (!tindakanCounts[monthYear]) tindakanCounts[monthYear] = {};

      // Proses kolom "Tindakan"
      const rawTindakan = (item["Tindakan"] || "").trim();
      if (rawTindakan) {
        const tindakanArray = rawTindakan.split(",").map(t => t.trim()).filter(Boolean);
        tindakanArray.forEach(tindakan => {
          tindakanCounts[monthYear][tindakan] = (tindakanCounts[monthYear][tindakan] || 0) + 1;
        });
      }
      // Sertakan "Lainnya" jika kolom "Lainnya" ada dan tidak kosong
      const rawLainnya = (item["Lainnya"] || "").trim();
      if (rawLainnya && rawLainnya !== "-") {
        tindakanCounts[monthYear]["Lainnya"] = (tindakanCounts[monthYear]["Lainnya"] || 0) + 1;
      }
    });
    const labelsTindakan = [...new Set(Object.values(tindakanCounts).flatMap(Object.keys))];
    const dataTindakan = labelsTindakan.map(tindakan => {
      return Object.keys(tindakanCounts).reduce((total, m) => total + (tindakanCounts[m][tindakan] || 0), 0);
    });
    return { labelsTindakan, dataTindakan };
  }

  // ========== Chart Generators ==========

  function createChart(canvasId, type, labels, dataLaki, dataPerempuan) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [
          {
            label: 'Laki-laki',
            data: dataLaki,
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: 'Perempuan',
            data: dataPerempuan,
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function createChartBiaya(canvasId, labels, dataBPJS, dataUmum) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'BPJS',
            data: dataBPJS,
            backgroundColor: 'rgba(75, 192, 192, 0.7)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          },
          {
            label: 'Umum',
            data: dataUmum,
            backgroundColor: 'rgba(255, 206, 86, 0.7)',
            borderColor: 'rgba(255, 206, 86, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function createChartTindakan(canvasId, labels, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const colorMap = {
      'Obat': 'rgba(255, 99, 132, 0.7)',
      'Cabut Anak': 'rgba(54, 162, 235, 0.7)',
      'Cabut Dewasa': 'rgba(255, 206, 86, 0.7)',
      'Tambal Sementara': 'rgba(75, 192, 192, 0.7)',
      'Tambal Tetap': 'rgba(153, 102, 255, 0.7)',
      'Scaling': 'rgba(255, 159, 64, 0.7)',
      'Rujuk': 'rgba(255, 0, 0, 0.7)',
      'Lainnya': 'rgba(201, 203, 207, 0.7)'
    };
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Jumlah Tindakan',
          data,
          backgroundColor: labels.map(label => colorMap[label] || 'rgba(201, 203, 207, 0.7)'),
          borderColor: labels.map(label => colorMap[label] ? colorMap[label].replace('0.7', '1') : 'rgba(201, 203, 207, 1)'),
          borderWidth: 1
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: {
          legend: { display: true, position: 'top' }
        }
      }
    });
  }

  // ========== Populate Tabel Kunjungan Harian ==========
  function populateTable(data) {
    tabelKunjunganBody.innerHTML = '';
    data.forEach(item => {
      // Tampilkan tombol hapus untuk semua data, meskipun _id tidak ada.
      // Jika tidak ada _id, gunakan properti 'sheetId' (yang harus dihasilkan di get-data.js).
      const deleteButtonHtml = `<button class="delete-button" data-id="${item._id || item.sheetId}">Hapus</button>`;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item["Tanggal Kunjungan"] || ""}</td>
        <td>${item["Nama Pasien"] || ""}</td>
        <td>${item["No.RM"] || ""}</td>
        <td>${item["Tindakan"] || ""}</td>
        <td>${item["Biaya"] || ""}</td>
        <td>${item["Lainnya"] || ""}</td>
        <td>
          ${deleteButtonHtml}
        </td>
      `;
      tabelKunjunganBody.appendChild(row);
    });
    addDeleteButtonListeners();
  }

  function addDeleteButtonListeners() {
    const deleteButtons = document.querySelectorAll('.delete-button');
    deleteButtons.forEach(button => {
      button.addEventListener('click', handleDelete);
    });
  }

  async function handleDelete(event) {
    const idToDelete = event.target.dataset.id;
    const modal = document.getElementById('deleteConfirmationModal');
    const confirmButton = document.getElementById('confirmDelete');
    const cancelButton = document.getElementById('cancelDelete');
    const modalMessage = document.getElementById('modal-message');

    modal.style.display = 'flex';

    confirmButton.onclick = async () => {
      try {
        // Endpoint delete-data harus mendukung penghapusan untuk MongoDB dan Google Sheets.
        const response = await fetch(`/api/delete-data?index=${idToDelete}`, { method: 'DELETE' });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.status !== "success") {
          throw new Error(result.message || "Gagal menghapus data di server");
        }
        const newData = await fetchData(filterTanggalInput.value || null);
        populateTable(newData);
        const activeSection = document.querySelector('.chart-section.active') || document.querySelector('.table-section.active');
        if (activeSection) updateCharts(activeSection.id);
        modalMessage.textContent = 'Data berhasil dihapus.';
        confirmButton.style.display = 'none';
        cancelButton.textContent = 'OK';
        cancelButton.onclick = () => {
          modal.style.display = 'none';
          confirmButton.style.display = 'inline-block';
          cancelButton.textContent = 'Batal';
          modalMessage.textContent = 'Apakah Anda yakin ingin menghapus data ini?';
        };
      } catch (error) {
        modalMessage.textContent = `Gagal menghapus data: ${error.message}`;
        confirmButton.style.display = 'none';
        cancelButton.textContent = "OK";
        cancelButton.onclick = () => {
          modal.style.display = 'none';
          confirmButton.style.display = 'inline-block';
          cancelButton.textContent = 'Batal';
          modalMessage.textContent = 'Apakah Anda yakin ingin menghapus data ini?';
        };
      }
    };

    cancelButton.onclick = () => {
      modal.style.display = 'none';
    };
  }

  async function fetchData(tanggal = null) {
    try {
      let url = '/api/get-data';
      if (tanggal) {
        url += `?tanggal=${tanggal}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("Gagal mengambil data:", error);
      const errorDiv = document.createElement('div');
      errorDiv.textContent = "Gagal mengambil data dari server. Pastikan server berjalan dan coba muat ulang halaman.";
      errorDiv.style.color = 'red';
      document.body.appendChild(errorDiv);
      return [];
    }
  }

  if (filterTanggalInput) {
    filterTanggalInput.addEventListener('change', async () => {
      const selectedDate = filterTanggalInput.value;
      const filteredData = await fetchData(selectedDate);
      populateTable(filteredData);
      const activeSection = document.querySelector('.chart-section.active') || document.querySelector('.table-section.active');
      if (activeSection && activeSection.id === 'total-pasien-harian') {
        updateCharts(activeSection.id);
      }
    });
  }

  async function initialLoad() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;
    if (filterTanggalInput) {
      filterTanggalInput.value = todayFormatted;
    }
    const data = await fetchData(filterTanggalInput.value || null);
    if (data.length > 0) {
      populateTable(data);
      showSection('total-pasien-harian');
      updateCharts('total-pasien-harian');
      sidebarLinks[0].classList.add('active');
    } else {
      console.log('Tidak ada data yang tersedia.');
      tabelKunjunganBody.innerHTML = '<tr><td colspan="7">Tidak ada data kunjungan.</td></tr>';
    }
  }

  initialLoad();
});
