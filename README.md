<div align="center">

# Nugi Content Factory x Open Carrousel

### AI-Powered Instagram Carousel Builder with SumoPod LLM & RunPod Image Generation

**Vercel-ready. Autonomous design engine. Real-time editor.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000.svg?style=flat-square)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149eca.svg?style=flat-square)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?style=flat-square)](https://www.typescriptlang.org)
[![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg?style=flat-square)](https://tailwindcss.com)
[![SumoPod](https://img.shields.io/badge/LLM-SumoPod-orange.svg?style=flat-square)](https://sumopod.com)
[![RunPod](https://img.shields.io/badge/Image%20Gen-RunPod%20SDXL-purple.svg?style=flat-square)](https://runpod.io)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

</div>

---

## 🌟 Overview

**Nugi Content Factory x Open Carrousel** adalah aplikasi web Next.js modern untuk membuat carousel Instagram berkualitas tinggi menggunakan kecerdasan buatan.

Aplikasi ini telah dimodifikasi penuh untuk siap di-deploy ke **Vercel** tanpa dependensi lokal Claude CLI lagi:
- **LLM**: Ditenagai oleh **SumoPod API** (OpenAI-compatible HTTP API dengan SSE streaming).
- **Image Generation**: Ditenagai oleh **RunPod SDXL Serverless Endpoint** (`wcxqunpceum6cw`).
- **Editor**: Editor 3-panel interaktif (Chat, Live Iframe Preview, Filmstrip drag-and-drop).
- **Export**: Render PNG pixel-perfect menggunakan `puppeteer-core` dan `@sparticuz/chromium` di Vercel serverless.

---

## 🏗️ Architecture

```
GitHub (nugiwabot/nugi-carousel)
    ↓
Vercel Serverless
    ├── /api/chat                  ──► SumoPod API (Streaming & Carousel Action Execution)
    ├── /api/generate-image         ──► RunPod SDXL Endpoint
    ├── /api/carousels/*           ──► /tmp/nugi-data (Ephemeral JSON + Mutex Locking)
    ├── /api/upload                ──► /tmp/nugi-uploads
    ├── /api/uploads/[...path]     ──► Serve uploaded assets safely
    └── /api/carousels/[id]/export ──► puppeteer-core + @sparticuz/chromium (PNG & ZIP)
```

---

## 🚀 Quickstart (Local Development)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nugiwabot/nugi-carousel.git
cd nugi-carousel
npm install
```

### 2. Setup Environment Variables
Salin file `.env.example` ke `.env.local`:
```bash
cp .env.example .env.local
```
Isi variabel berikut di `.env.local`:
```env
SUMOPOD_API_KEY=your_sumopod_api_key
SUMOPOD_MODEL=deepseek-v4-pro

RUNPOD_API_KEY=your_runpod_api_key
RUNPOD_ENDPOINT_ID=wcxqunpceum6cw
```

### 3. Jalankan Dev Server
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## ☁️ Deploy to Vercel

1. Buka [Vercel Dashboard](https://vercel.com/new).
2. Import repository **`nugiwabot/nugi-carousel`**.
3. Di bagian **Environment Variables**, tambahkan:
   - `SUMOPOD_API_KEY`: API key SumoPod Anda
   - `SUMOPOD_MODEL`: `deepseek-v4-pro`
   - `RUNPOD_API_KEY`: API key RunPod Anda
   - `RUNPOD_ENDPOINT_ID`: `wcxqunpceum6cw`
4. Klik **Deploy**!

---

## 🎨 Features

- **Autonomous AI Carousel Generation**: Berikan topik/ide, AI langsung merancang 5-8 slide narrative arc (Hook, Problem, Solution, Value, CTA).
- **AI Image Generation via RunPod**: Menghasilkan gambar realistis / artistik via SDXL langsung ke dalam slide.
- **Brand Consistency**: Konfigurasi warna primer, font Google Fonts, logo, dan style keywords yang otomatis diterapkan ke semua slide.
- **Live Preview & Safe-Zone Overlay**: Preview iframe sandboxed dengan safe-zone overlay Instagram (grid 1:1, story, feed).
- **Drag & Drop Filmstrip**: Urutkan dan kelola slide dengan mudah menggunakan `@dnd-kit`.
- **Undo History**: Setiap slide menyimpan riwayat revisi otomatis.
- **One-Click Export**: Download carousel lengkap dalam bentuk ZIP berisi gambar PNG berkualitas tinggi (1080×1080, 1080×1350, atau 1080×1920).
- **Caption & Hashtag Generator**: Generate caption Instagram siap pakai beserta 20-30 hashtag tersegmentasi.

---

## 📄 License

[MIT](./LICENSE)
