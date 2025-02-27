// data-harian.js

document.addEventListener("DOMContentLoaded", () => {
    // Ambil elemen DOM
    const dateInput = document.getElementById("tanggal-kunjungan");
    const dataForm = document.getElementById("dataForm");
    const submitBtn = document.getElementById("submit-button");
    const cancelBtn = document.getElementById("cancel-button");
    const messageEl = document.getElementById("message");
    const overlay = document.getElementById("blur-overlay");
  
    // Fungsi untuk menampilkan pesan status
    const showMessage = (text, statusClass) => {
      overlay.style.display = 'block';
      if (statusClass === "loading") {
        messageEl.innerHTML = `${text}<br><div class="ios-spinner"></div>`;
      } else {
        messageEl.textContent = text;
      }
      messageEl.className = `status-message ${statusClass} show`;
  
      setTimeout(() => {
        messageEl.classList.remove("show");
        setTimeout(() => {
          messageEl.className = "status-message";
          messageEl.innerHTML = "";
          overlay.style.display = 'none';
        }, 300);
      }, 3000);
    };
  
    // Set tanggal hari ini secara otomatis
    const setToday = () => {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    };
  
    setToday();
  
    // Event listener untuk submit form
    dataForm.addEventListener("submit", async (e) => {
      e.preventDefault();
  
      // Ubah tampilan tombol submit
      submitBtn.innerHTML = '<div class="ios-spinner"></div>';
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.7";
  
      const formData = new FormData(dataForm);
      const formObject = Object.fromEntries(formData.entries());
  
      // Tangani checkbox tindakan
      const tindakanChecked = formData.getAll("tindakan[]");
      if (tindakanChecked.length > 0) {
        formObject["tindakan"] = tindakanChecked.join(", ");
      }
  
      const mappedFormObject = {
        "Tanggal Kunjungan": formObject.tanggalKunjungan,
        "Nama Pasien": formObject.namaPasien,
        "No.RM": formObject.noRM,
        "Kelamin": formObject.kelamin,
        "Biaya": formObject.biaya,
        "Tindakan": formObject.tindakan || "",
        "Lainnya": formObject.lainnya || ""
      };
  
      console.log("Data form:", formObject);
  
      showMessage("Mengirim data", "loading");
  
      showMessage("Mengirim data", "loading");

    try {
      // --- Pengiriman ke Google Sheets (seperti sebelumnya) ---
      const sheetsResponse = await fetch(
        "https://script.google.com/macros/s/AKfycbyAS1Cc5e5hV6QMk2o8MI2VCxEY6KtzohoIc5EyrM3bFnFD31HHTTqgrDAJgA2M-Umr/exec",
        {
          method: "POST",
          body: new URLSearchParams(mappedFormObject),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      const sheetsData = await sheetsResponse.json();
      if (sheetsData.result !== "success") {
        throw new Error(sheetsData.message || "Gagal mengirim data ke Google Sheets.");
      }
      // --- Pengiriman ke Server Lokal (Tambahan) ---
      const serverResponse = await fetch("/submit-data", {  // Endpoint di server
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Penting: Kirim sebagai JSON
        body: JSON.stringify(mappedFormObject), // Ubah data ke format JSON
      });

      if (!serverResponse.ok) { // Cek status response dari server lokal
        throw new Error(`Error from server: ${serverResponse.status} ${serverResponse.statusText}`);
      }

      const serverData = await serverResponse.json(); // Parse response dari server
        if (serverData.status !== 'success'){   //sesuaikan kondisi logic
          throw new Error(serverData.message || "Gagal memproses data di server");
        }


      // --- Jika kedua pengiriman berhasil ---
      showMessage("Data berhasil dikirim!", "success");
      dataForm.reset();
      setToday();

    } catch (error) {
      console.error(error);
      showMessage(error.message, "error");  //tampilkan pesan dari error yang ditangkap

    } finally {
        setTimeout(() => {
          submitBtn.innerHTML = "Kirim Data";
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
        }, 3000);
      }
    });
  
    // Event listener untuk tombol cancel
    cancelBtn.addEventListener("click", () => {
      window.history.back();
    });
  });