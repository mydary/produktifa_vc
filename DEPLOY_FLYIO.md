# Panduan Deploy Produktifa ke Fly.io (Gratis & Mendukung SQLite + WebSocket)

Fly.io adalah pilihan ideal untuk aplikasi **Produktifa** karena menyediakan **Persistent Volume gratis** untuk database SQLite (`produktifa.db`) serta mendukung koneksi **WebSocket real-time** tanpa batas waktu.

---

## 1. Persiapan Awal

Pastikan Anda telah memiliki akun di [Fly.io](https://fly.io) dan menginstal **flyctl** di komputer Anda:

- **Windows (PowerShell):**
  ```powershell
  pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
  ```
- **macOS / Linux:**
  ```bash
  curl -L https://fly.io/install.sh | sh
  ```

---

## 2. Login ke Fly.io

Jalankan perintah berikut di terminal:
```bash
fly auth login
```
Peramban web akan terbuka otomatis untuk menyelesaikan proses otorisasi akun Anda.

---

## 3. Inisialisasi Proyek (`fly launch`)

Di folder proyek Produktifa, jalankan:
```bash
fly launch --no-deploy
```

- Ketika ditanya **App Name**: Masukkan nama unik aplikasi Anda (misal: `produktifa-dary-2026`).
- Ketika ditanya **Region**: Pilih **`sin` (Singapore)** untuk latensi tercepat dan terdekat dengan pengguna di Indonesia.
- Ketika ditanya apakah ingin menggunakan file `fly.toml` yang sudah ada: Pilih **Yes**.

---

## 4. Buat Persistent Volume untuk SQLite

Agar database `produktifa.db` tetap aman dan tersimpan saat server melakukan restart atau update:
```bash
fly volumes create produktifa_data --region sin --size 1
```
*(Volume 1 GB ini sepenuhnya gratis dalam kuota free tier Fly.io).*

---

## 5. Set Secret Environment Variables

Atur kunci rahasia JWT untuk keamanan otentikasi akun pengguna:
```bash
fly secrets set SECRET_KEY="kunci-rahasia-produktifa-acak-dan-aman"
```

*(Opsional - Jika ingin mengaktifkan pengiriman email pengingat tugas & kode verifikasi via Gmail App Password)*:
```bash
fly secrets set SMTP_USER="emailkamu@gmail.com" SMTP_PASS="password-aplikasi-16-karakter" SMTP_FROM="Produktifa <emailkamu@gmail.com>"
```

---

## 6. Deploy Aplikasi!

Jalankan perintah deploy:
```bash
fly deploy
```

Fly.io akan otomatis membangun Docker image, memasang dependensi, meng-compile build Vite frontend, dan menjalankan server Express beserta WebSocket.

Setelah selesai, buka aplikasi Anda langsung di peramban:
```bash
fly open
```
Aplikasi Anda akan aktif dengan domain HTTPS gratis: `https://<nama-app-anda>.fly.dev`!

---

## 7. Perintah Berguna Lainnya

- **Melihat Log Aplikasi Real-time:**
  ```bash
  fly logs
  ```
- **Melihat Status Mesin & Database:**
  ```bash
  fly status
  ```
- **Restart Server:**
  ```bash
  fly apps restart
  ```
