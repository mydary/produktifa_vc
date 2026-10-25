# Panduan Deploy Produktifa ke Vercel (100% Gratis & Bebas Kartu Kredit)

Aplikasi **Produktifa** telah disesuaikan arsitekturnya untuk berjalan mulus di **Vercel** sebagai **Vite React SPA berkecepatan tinggi** dengan penyimpanan data lokal persisten (`localStorage` + `BroadcastChannel` untuk sinkronisasi antartab).

---

## Mengapa Arsitektur Ini Cocok di Vercel?
- ✅ **100% Gratis Selamanya:** Tidak memerlukan kartu kredit (*credit card*) sama sekali saat pendaftaran di Vercel.
- ✅ **Tanpa Setup Database Rumit:** Data terisi otomatis dengan akun demo (Ani PM, Budi Dev, Citra UI), proyek awal, tugas, gamifikasi, dan percakapan.
- ✅ **Super Cepat (0ms Cold Start):** Di-hosting langsung di CDN Global Edge Vercel tanpa ada delay server "tidur".
- ✅ **Sinkronisasi Tab Real-Time:** Jika Anda membuka 2 tab peramban (misal tab 1 sebagai Ani dan tab 2 sebagai Budi), perubahan tugas dan pesan chat langsung tersinkronisasi secara otomatis melalui `BroadcastChannel`.

---

## Langkah-Langkah Deploy ke Vercel:

### 1. Push Kode ke GitHub
Pastikan kode terbaru sudah terunggah ke repositori GitHub Anda:
```bash
git add .
git commit -m "feat: optimize architecture for Vercel deployment"
git push origin main
```

### 2. Hubungkan ke Vercel
1. Kunjungi **[vercel.com](https://vercel.com)** dan klik **Sign Up** atau **Log In**.
2. Pilih opsi **Continue with GitHub** (tidak akan pernah meminta nomor kartu kredit).
3. Di Dashboard Vercel, klik tombol **Add New...** -> **Project**.
4. Cari dan klik tombol **Import** pada repositori **`produktifa`** Anda.

### 3. Konfigurasi Proyek (Otomatis Terdeteksi)
Vercel akan otomatis mengenali proyek sebagai **Vite**:
- **Framework Preset:** `Vite`
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment Variables:** Tidak wajib diisi (semuanya sudah siap pakai!).

### 4. Klik "Deploy"!
- Vercel akan meng-compile build Vite dalam waktu ~20-30 detik.
- Setelah selesai, Anda akan disambut animasi konfeti dan tautan domain gratis resmi:
  **`https://produktifa-<username>.vercel.app`**

---

## Akun Demo Siap Pakai di Web Vercel:
Pada halaman login, Anda dapat langsung mengklik tombol cepat:
- **Ani (PM):** `ani@mail.com` | Password: `rahasia123`
- **Budi (Dev):** `budi@mail.com` | Password: `rahasia123`
- **Citra (UI):** `citra@mail.com` | Password: `rahasia123`
Atau Anda dapat mendaftarkan akun baru menggunakan form registrasi.
