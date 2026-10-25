# Panduan Lengkap Deploy Produktifa ke Render.com (100% Gratis & Tanpa Kartu Kredit)

Render.com mendukung aplikasi **Node.js + WebSockets + Express + React** secara utuh dan **TIDAK memerlukan kartu kredit** saat mendaftar.

---

## Bagian 1: Buat Repositori di GitHub

1. Buka [github.com](https://github.com) dan login ke akun GitHub Anda.
2. Klik tombol **New** (atau tanda `+` di kanan atas) untuk membuat repositori baru:
   - **Repository name:** `produktifa` (atau nama lain yang Anda inginkan).
   - **Visibility:** Pilih **Public** atau **Private** (keduanya didukung oleh Render gratis).
   - **Jangan centang** "Add a README file" (karena kode proyek sudah lengkap).
   - Klik **Create repository**.
3. Salin URL repositori Anda, misalnya: `https://github.com/username-anda/produktifa.git`.

---

## Bagian 2: Push Kode dari Komputer Anda ke GitHub

Buka terminal di folder proyek Produktifa pada komputer Anda, lalu jalankan perintah berikut secara berurutan:

```bash
# 1. Pastikan branch bernama main
git branch -M main

# 2. Hubungkan ke repositori GitHub Anda (ganti URL dengan URL repo Anda)
git remote add origin https://github.com/username-anda/produktifa.git

# 3. Push seluruh kode ke GitHub
git push -u origin main
```

*(Jika diminta login, masukkan username GitHub dan Personal Access Token / password akun GitHub Anda).*

---

## Bagian 3: Hubungkan dan Deploy di Render.com

1. Buka **[render.com](https://render.com)** dan klik **Sign In** atau **Get Started for Free**.
2. Pilih opsi **Continue with GitHub** (tidak akan pernah meminta nomor kartu kredit).
3. Setelah masuk ke Dashboard Render:
   - Klik tombol **New +** di pojok kanan atas, lalu pilih **Web Service**.
   - Pilih opsi **Build and deploy from a Git repository**, lalu klik **Next**.
   - Hubungkan akun GitHub Anda dan pilih repositori `produktifa` yang baru saja Anda buat.

4. **Isi Formulir Konfigurasi Layanan:**
   - **Name:** `produktifa` (atau nama subdomain yang Anda sukai).
   - **Region:** `Singapore` (paling dekat dengan Indonesia dan latensi rendah).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:**
     ```bash
     npm install && npm run build
     ```
   - **Start Command:**
     ```bash
     npm start
     ```
   - **Instance Type:** Pilih **Free** ($0 / month).

5. **Tambahkan Environment Variables:**
   - Klik menu dropdown **Advanced** atau tab **Environment Variables**.
   - Tambahkan variabel berikut:
     | Key | Value | Keterangan |
     | :--- | :--- | :--- |
     | `NODE_ENV` | `production` | Mengaktifkan optimasi produksi |
     | `PORT` | `3000` | Port default aplikasi |
     | `SECRET_KEY` | `kunci-rahasia-produktifa-acak-12345` | Kunci enkripsi token login |

   *(Opsional: Jika ingin fitur email pengingat aktif, tambahkan `SMTP_USER` dan `SMTP_PASS` menggunakan App Password Gmail).*

6. **Klik "Deploy Web Service":**
   - Render akan mulai mengunduh kode, memasang paket, meng-compile build Vite, dan menyalakan server.
   - Proses ini biasanya memakan waktu 2–3 menit.
   - Setelah status berubah menjadi **Live**, aplikasi Produktifa Anda langsung dapat diakses melalui URL:
     **`https://produktifa.onrender.com`** (dengan SSL/HTTPS gratis)!
