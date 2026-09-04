# 📘 Panduan Lengkap Setup Saat Pindah Komputer
### Nugi Content Factory x Open Carrousel

Dokumen ini adalah panduan langkah demi langkah jika Anda ingin membuka dan menjalankan project ini di komputer/laptop baru, baik untuk **Antigravity IDE** maupun **Local Web Server**.

---

## 📋 Prasyarat di Komputer Baru
Pastikan komputer baru sudah terinstall:
1. **Node.js (Versi 20 ke atas)**: Download di [https://nodejs.org](https://nodejs.org)
2. **Git**: Download di [https://git-scm.com](https://git-scm.com)
3. **Browser Chromium / Microsoft Edge / Google Chrome**: Sudah terpasang otomatis di Windows/Mac.

---

## 🚀 Langkah 1: Clone Repository & Install Dependencies

Buka terminal (PowerShell / Command Prompt / Terminal Mac) dan jalankan:

```bash
# 1. Clone repository dari GitHub
git clone https://github.com/nugiwabot/nugi-carousel.git

# 2. Masuk ke direktori project
cd nugi-carousel

# 3. Install semua dependencies
npm install
```

---

## 🔑 Langkah 2: Buat File `.env.local`

Buat file baru bernama `.env.local` di folder root project (`nugi-carousel/.env.local`).
Isi dengan konfigurasi berikut:

```env
# ------ RunPod (Image Generation SDXL) ------
RUNPOD_API_KEY=your_runpod_api_key_here
RUNPOD_ENDPOINT_ID=wcxqunpceum6cw

# ------ SumoPod (LLM) ------
# Diisi jika Anda ingin menjalankan chat AI di website lokal (npm run dev)
SUMOPOD_API_KEY=your_sumopod_api_key
SUMOPOD_MODEL=deepseek-v4-pro
```

> **Catatan Penting Keamanan:**
> File `.env.local` sudah otomatis masuk ke `.gitignore`, sehingga aman dan tidak akan pernah ter-upload ke public GitHub saat Anda melakukan git commit/push.

---

## 🤖 Langkah 3: Menggunakan Antigravity IDE di Komputer Baru

Jika Anda bekerja langsung di dalam **Antigravity IDE**:

1. Buka folder `nugi-carousel` sebagai workspace di Antigravity IDE.
2. Anda **tidak membutuhkan API key LLM luar** di Antigravity IDE karena AI Assistant di Antigravity langsung bertindak sebagai copywriter, strategist, dan designer.
3. Anda cukup ketik di chat Antigravity:
   > *"Buatkan 5 carousel tentang: [Topik 1], [Topik 2], [Topik 3], dst..."*
4. Antigravity akan:
   - Menulis seluruh slide dan copywriting.
   - Memanggil RunPod SDXL secara otomatis untuk Slide 1 (Cover).
   - Menerapkan dark gradient scrim overlay dan desain kartu kontras tinggi.
   - Menyimpan semua carousel ke `data/carousels.json`.
   - Merender preview visual slide (PNG) langsung di dalam chat.

---

## 🌐 Langkah 4: Menjalankan Web Editor Lokal (Opsional)

Jika Anda ingin melihat atau mengedit carousel melalui tampilan antarmuka web di browser:

```bash
npm run dev
```

Lalu buka di browser: **`http://localhost:3000`**
- Semua carousel yang sudah dibuat di Antigravity IDE akan langsung muncul di halaman utama.
- Anda bisa drag-and-drop urutan slide, mengubah teks secara visual, atau klik tombol **Export** untuk men-download gambar PNG berkualitas tinggi dalam format ZIP.

---

## 🛠️ Ringkasan Command Cepat:

| Perintah | Fungsi |
|---|---|
| `git pull origin main` | Mengambil update terbaru dari GitHub |
| `npm run dev` | Menjalankan server lokal web editor |
| `npm run build` | Cek validitas TypeScript & bundling production |
| `node scripts/doctor.mjs` | Cek kesehatan environment lokal |
| `node scripts/bulk-generator.mjs` | Menjalankan engine bulk generator |
