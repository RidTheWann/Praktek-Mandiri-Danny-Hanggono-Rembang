'use strict';

document.addEventListener('DOMContentLoaded', () => {
// --- Fungsi untuk toggle visibilitas password ---
  function setupPasswordToggle(toggleButtonId, passwordInputId) {
    const togglePassword = document.getElementById(toggleButtonId);
    if (togglePassword) {
      togglePassword.addEventListener('click', () => {
        const passwordInput = document.getElementById(passwordInputId);
        if (passwordInput) {
          const isPassword = passwordInput.type === 'password';
          passwordInput.type = isPassword ? 'text' : 'password';
          // Perbarui ikon (Font Awesome)
          togglePassword.innerHTML = isPassword
            ? '<i class="fas fa-eye-slash"></i>'
            : '<i class="fas fa-eye"></i>';
        }
      });
    }
  }

  // --- Toggle visibilitas password (Login) ---
  setupPasswordToggle('togglePassword', 'password');

  // --- Toggle visibilitas password (Register) ---
  setupPasswordToggle('toggleRegPassword', 'reg-password');

  // --- Animasi Ganti Form ---
    const container = document.querySelector('.container');
    const registerBtn = document.getElementById('register-btn');
    const loginBtn = document.getElementById('login-btn');

    if (container && registerBtn && loginBtn) {
        registerBtn.addEventListener('click', () => {
            container.classList.add('active');
        });

        loginBtn.addEventListener('click', () => {
            container.classList.remove('active');
        });
    }


    // --- Handling Submit Form Login ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const errorMessage = document.getElementById('errorMessage');
            if (errorMessage) errorMessage.textContent = "";

            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            if (usernameInput && passwordInput) {
                const username = usernameInput.value.trim();
                const password = passwordInput.value.trim();

                if (!username || !password) {
                    if (errorMessage) errorMessage.textContent = "Username dan Password Salah!";
                    loginForm.classList.add('shake');
                    setTimeout(() => {
                        loginForm.classList.remove('shake');
                    }, 500);
                    return;
                }

               // ---  GANTI DENGAN AUTENTIKASI KE SERVER ---
                const validUsername = "user"; // Contoh - GANTI!
                const validPassword = "user"; // Contoh - GANTI!

                if (username === validUsername && password === validPassword) {
                    // ---  GANTI DENGAN LOGIKA SETELAH LOGIN BERHASIL (redirect) ---
                    window.location.href = "pages/Home.html"; //  Ganti path,

                } else {
                    if (errorMessage) errorMessage.textContent = "Username atau Password salah!";
                    loginForm.classList.add('shake');
                    setTimeout(() => {
                        loginForm.classList.remove('shake');
                    }, 500);
                }
            }
        });
    }

     // ---  Handling Submit Form Registrasi (Contoh Sederhana) ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const regErrorMessage = document.getElementById('regErrorMessage');
            if (regErrorMessage) regErrorMessage.textContent = "";

            const usernameInput = document.getElementById('reg-username');
            const emailInput = document.getElementById('reg-email');
            const passwordInput = document.getElementById('reg-password');

            if (usernameInput && emailInput && passwordInput) {
                const username = usernameInput.value.trim();
                const email = emailInput.value.trim();
                const password = passwordInput.value.trim();

                // --- VALIDASI (Tambahkan validasi yang lebih kuat, misal cek format email) ---
                if (!username || !email || !password) {
                    if (regErrorMessage) regErrorMessage.textContent = "Semua field harus diisi!";
                    registerForm.classList.add('shake');
                    setTimeout(() => { registerForm.classList.remove('shake'); }, 500);
                    return;
                }

               // ---  GANTI DENGAN PENYIMPANAN KE DATABASE ---
                //  Kirim data ke server (backend) Anda.  Contoh di bawah ini HANYA alert.
                alert(`Registrasi berhasil!\nUsername: ${username}\nEmail: ${email}`);

                //  Setelah registrasi, Anda bisa redirect ke login, atau langsung login.
                // window.location.href = 'index.html'; // Contoh redirect (hapus jika ingin langsung login)

                // Reset form
                registerForm.reset();
                // Kembali ke tampilan login (optional)
                if (container) {
                    container.classList.remove('active');
                }
            }
        });
    }
});