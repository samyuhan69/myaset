# 🚀 AsetKu - Personal Portfolio Manager (Serverless)

**AsetKu** adalah aplikasi web progresif (PWA) untuk melacak total kekayaan bersih (*Net Worth*) secara real-time. 

Aplikasi ini dibangun dengan pendekatan **Privacy-First**: Tidak ada database server pihak ketiga. Seluruh data keuangan Anda tersimpan aman di **Google Drive** pribadi Anda sendiri.

![Screenshot Aplikasi](https://via.placeholder.com/800x400?text=Preview+Tampilan+AsetKu)
*(Jangan lupa ganti link gambar ini dengan screenshot asli aplikasimu)*

## ✨ Fitur Utama

1.  **🔒 Privasi Terjamin (Serverless)**
    * Data tidak pernah dikirim ke server pengembang.
    * Data tersimpan lokal di perangkat (LocalStorage) dan dibackup ke Google Drive pengguna.

2.  **☁️ Google Drive Smart Sync**
    * **Auto-Login & Smart Session:** Login sekali, sesi tersimpan (auto-refresh token).
    * **Auto-Backup:** Setiap perubahan (tambah aset/transaksi) otomatis terupload ke Cloud.
    * **Smart Restore:** Saat membuka aplikasi di perangkat berbeda, sistem otomatis mendeteksi jika ada data lebih baru di Cloud dan mengunduhnya.

3.  **📈 Pelacakan Harga Real-time**
    * **Saham Indonesia (IHSG):** Menggunakan Yahoo Finance Proxy.
    * **Emas (Antam):** Live scraping harga Logam Mulia.
    * **Reksadana:** Live scraping NAV dari Bibit.id.
    * **Mata Uang:** Konversi otomatis USD ke IDR.

4.  **📱 PWA (Progressive Web App)**
    * Bisa diinstal di Android, iOS, dan Desktop layaknya aplikasi native.
    * Bisa berjalan dalam mode Offline.

5.  **📊 Analisis Keuangan**
    * **Financial Runway:** Menghitung berapa lama dana bertahan tanpa penghasilan.
    * **Asset Allocation:** Diagram lingkaran (Pie Chart) persebaran aset.
    * **Rebalancing Tool:** Saran otomatis untuk menyeimbangkan portofolio sesuai target.

## 🛠️ Teknologi

* **Frontend:** HTML5, CSS3 (Grid/Flexbox), Vanilla JavaScript (ES6+).
* **Backend:** Tidak ada (Serverless).
* **Storage:** Google Drive API v3 (Scope: `drive.file`) & LocalStorage.
* **Library:** Chart.js (Grafik), Google Identity Services (Auth).

## 🚀 Cara Instalasi & Menjalankan (Local)

Ikuti langkah-langkah berikut untuk menjalankan project ini di komputer Anda:

1.  **Clone Repository**
    ```bash
    git clone [https://github.com/username-kamu/asetku.git](https://github.com/username-kamu/asetku.git)
    cd asetku
    ```

2.  **Setup Google Cloud Console (Wajib)**
    Agar fitur login & backup berfungsi, Anda perlu kredensial Google:
    * Buka [Google Cloud Console](https://console.cloud.google.com/).
    * Buat Project baru.
    * Aktifkan **Google Drive API**.
    * Buat **OAuth 2.0 Client ID** (pilih Web Application).
    * Masukkan `http://127.0.0.1:5500` (atau port Live Server Anda) ke bagian **Authorized JavaScript origins**.
    * Buat **API Key** dan batasi (restrict) hanya untuk Google Drive API.

3.  **Konfigurasi Kodingan**
    Buka file `script.js` dan edit bagian paling atas:
    ```javascript
    const G_CLIENT_ID = 'MASUKKAN_CLIENT_ID_ANDA_DISINI';
    const G_API_KEY = 'MASUKKAN_API_KEY_ANDA_DISINI';
    ```

4.  **Jalankan Aplikasi**
    Karena kebijakan keamanan Google Auth, aplikasi tidak bisa dijalankan dengan klik ganda file HTML (`file://`). Gunakan server lokal.
    * **VS Code:** Install ekstensi **Live Server**, buka `index.html`, klik kanan -> **Open with Live Server**.

## 📝 Lisensi

[MIT License](LICENSE) - Bebas untuk digunakan, dimodifikasi, dan dipelajari.

---
*Dibuat dengan ❤️ untuk kemerdekaan finansial.*
