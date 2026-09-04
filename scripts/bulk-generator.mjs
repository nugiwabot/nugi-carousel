import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'carousels.json');

function existsSync(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// Read .env.local if present
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env.local');
  if (existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...vals] = trimmed.split('=');
      if (key && vals.length > 0) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  }
}

loadEnv();

const RUNPOD_API_BASE = 'https://api.runpod.ai/v2';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || 'wcxqunpceum6cw';

if (!RUNPOD_API_KEY) {
  console.warn('⚠️ RUNPOD_API_KEY tidak ditemukan di environment atau .env.local');
}

/**
 * Generate an image via RunPod SDXL
 */
export async function generateImageSDXL(prompt, width = 1024, height = 1280) {
  console.log(`  🎨 [RunPod SDXL] Memanggil endpoint ${RUNPOD_ENDPOINT_ID}...`);
  console.log(`     Prompt: "${prompt.slice(0, 80)}..."`);

  const submitRes = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({
      input: {
        prompt,
        negative_prompt: 'blurry, low quality, watermark, text, ugly, deformed, distorted, lowres',
        width,
        height,
        num_inference_steps: 25,
        guidance_scale: 7.5,
      },
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`RunPod submit failed (HTTP ${submitRes.status}): ${errText}`);
  }

  const { id: jobId } = await submitRes.json();
  if (!jobId) throw new Error('No job ID returned from RunPod');

  // Poll until completed
  const start = Date.now();
  while (Date.now() - start < 120000) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!statusRes.ok) continue;
    const data = await statusRes.json();
    if (data.status === 'COMPLETED') {
      let image = data.output?.image_url || data.output?.image;
      if (!image && Array.isArray(data.output?.images) && data.output.images[0]) {
        const first = data.output.images[0];
        image = typeof first === 'string' ? first : first.image;
      }
      if (!image) throw new Error('No image payload in RunPod output');
      if (image.startsWith('http') || image.startsWith('data:')) return image;
      return `data:image/png;base64,${image}`;
    }
    if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(data.status)) {
      throw new Error(`RunPod job ${data.status}: ${data.error || 'Unknown'}`);
    }
  }
  throw new Error('RunPod generation timed out after 2 minutes');
}

/**
 * Save or update carousel in local data/carousels.json
 */
export function saveCarouselToStore(carousel) {
  const dataDir = path.join(ROOT_DIR, 'data');
  if (!existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let store = { carousels: [] };
  if (existsSync(DATA_FILE)) {
    try {
      store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      store = { carousels: [] };
    }
  }

  const idx = store.carousels.findIndex((c) => c.id === carousel.id);
  if (idx === -1) {
    store.carousels.push(carousel);
  } else {
    store.carousels[idx] = carousel;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  console.log(`  💾 [Store] Carousel "${carousel.name}" (ID: ${carousel.id}) tersimpan di ${DATA_FILE}`);
}

/**
 * Render a slide HTML string to PNG image using headless Edge/Chrome
 */
export async function renderSlideToImage(slideHtml, outPath) {
  try {
    const puppeteerModule = await import(
      'file:///' + path.join(ROOT_DIR, 'node_modules', 'puppeteer-core', 'lib', 'esm', 'puppeteer', 'puppeteer-core.js').replace(/\\/g, '/')
    );
    const puppeteer = puppeteerModule.default || puppeteerModule;
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ];
    let execPath = edgePaths.find((p) => existsSync(p));
    if (!execPath) return null;

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

    // Ensure complete HTML structure with fonts
    let fullHtml = slideHtml;
    if (!slideHtml.includes('<html')) {
      fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1350px; overflow: hidden; background: #070b14; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; }
  </style>
</head>
<body>${slideHtml}</body>
</html>`;
    }

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, type: 'png' });
    await browser.close();
    return outPath;
  } catch (err) {
    console.warn(`  ⚠️ Render image warning: ${err.message}`);
    return null;
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a full Carousel with all slides and optional SDXL image generation on Slide 1
 */
export async function createCarouselFromPlan({
  name,
  aspectRatio = '4:5',
  caption = '',
  hashtags = [],
  slides = [],
  renderPreviews = true,
  outputDir = null,
}) {
  console.log(`\n🚀 [Generator] Membuat Carousel: "${name}" (${slides.length} slides)`);
  const carouselId = generateId();
  const createdSlides = [];

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const order = i;
    const slideId = generateId();
    let finalHtml = s.html;

    // Slide 1 or any slide with imagePrompt gets an SDXL image
    if (s.imagePrompt && s.imagePrompt.trim()) {
      try {
        const imageUri = await generateImageSDXL(s.imagePrompt.trim(), 1024, 1280);
        if (finalHtml.includes('{{IMAGE}}')) {
          finalHtml = finalHtml.replaceAll('{{IMAGE}}', imageUri);
        } else if (finalHtml.includes('<img src=""')) {
          finalHtml = finalHtml.replaceAll('<img src=""', `<img src="${imageUri}"`);
        } else {
          // Prepend background image wrapper with dark gradient scrim
          const stripped = finalHtml.replace(
            /(<div[^>]*style=["'][^"']*?)(background(?:-color)?:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+))([^"']*?["'])/i,
            '$1background:transparent$3'
          );
          finalHtml = `<div style="position:relative; width:100%; height:100%; overflow:hidden; box-sizing:border-box; background:#070b14;"><img src="${imageUri}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.45; filter:brightness(0.7) contrast(1.1); z-index:0;" /><div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(7,11,20,0.35) 0%, rgba(7,11,20,0.85) 60%, #070b14 100%); z-index:1;"></div><div style="position:relative; z-index:2; width:100%; height:100%; box-sizing:border-box;">${stripped}</div></div>`;
        }
        console.log(`  ✅ Slide ${order + 1}: Gambar AI RunPod SDXL berhasil disematkan.`);
      } catch (err) {
        console.error(`  ⚠️ Slide ${order + 1} Image Gen Error:`, err.message);
        finalHtml = finalHtml.replaceAll(
          '{{IMAGE}}',
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1000'><rect width='100%' height='100%' fill='%23070b14'/><text x='50%' y='50%' fill='%2364748b' font-size='28' text-anchor='middle' font-family='sans-serif'>AI Image Fallback</text></svg>"
        );
      }
    }

    createdSlides.push({
      id: slideId,
      order,
      notes: s.notes || `Slide ${order + 1}`,
      html: finalHtml,
      previousVersions: [],
    });

    // Optionally render preview to PNG
    if (renderPreviews && outputDir) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      const outPath = path.join(outputDir, slug, `slide-${order + 1}.png`);
      const rendered = await renderSlideToImage(finalHtml, outPath);
      if (rendered) {
        console.log(`  📸 Preview: slide-${order + 1}.png`);
      }
    }
  }

  const carousel = {
    id: carouselId,
    name,
    aspectRatio,
    slides: createdSlides,
    referenceImages: [],
    chatSessionId: null,
    isTemplate: false,
    tags: ['bulk-generated', 'nugi-content-factory'],
    caption: caption || `${name}\n\nSwipe sampai akhir untuk melihat framework lengkapnya! 📲✨`,
    hashtags: hashtags.length > 0 ? hashtags : ['#propertimarketing', '#leadgeneration', '#automasi', '#businessgrowth'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveCarouselToStore(carousel);
  console.log(`✨ [Selesai] Carousel "${name}" selesai dibuat dengan ${createdSlides.length} slide!\n`);
  return carousel;
}

export async function runBulkGenerator(plans, options = {}) {
  console.log(`\n======================================================`);
  console.log(`📦 NUGI CONTENT FACTORY — BULK CAROUSEL GENERATOR`);
  console.log(`   Memproses ${plans.length} rencana carousel secara otomatis`);
  console.log(`======================================================\n`);

  const results = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    console.log(`--- [${i + 1}/${plans.length}] Memproses: ${plan.name} ---`);
    const res = await createCarouselFromPlan({
      ...plan,
      outputDir: options.outputDir || path.join(ROOT_DIR, 'public', 'generated-carousels'),
      renderPreviews: options.renderPreviews !== false,
    });
    results.push(res);
  }

  console.log(`======================================================`);
  console.log(`🎉 BERHASIL: ${results.length} Carousel telah selesai dibuat & disimpan!`);
  console.log(`======================================================\n`);
  return results;
}
