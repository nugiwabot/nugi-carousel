import puppeteerCore, { type Browser } from "puppeteer-core";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { wrapSlideHtml, extractFontFamilies } from "./slide-html";
import { getInlinedFontCSS } from "./fonts";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

// Singleton browser with lifecycle management
let browser: Browser | null = null;
let exportCount = 0;
const MAX_EXPORTS_BEFORE_RESTART = 50;

async function getBrowserExecutable(): Promise<string | undefined> {
  // On Vercel/production: use @sparticuz/chromium
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    try {
      // Dynamic import to avoid bundling issues in dev
      const chromium = await import("@sparticuz/chromium");
      return await chromium.default.executablePath();
    } catch {
      throw new Error(
        "Export failed: @sparticuz/chromium not available. Make sure it is installed."
      );
    }
  }
  // In local dev: use system chromium or let puppeteer find it
  // Try common locations
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  // Let puppeteer-core decide (will fail if no chrome installed)
  return undefined;
}

async function getBrowser(): Promise<Browser> {
  if (browser && exportCount >= MAX_EXPORTS_BEFORE_RESTART) {
    await browser.close().catch(() => {});
    browser = null;
    exportCount = 0;
  }
  if (!browser || !browser.isConnected()) {
    const executablePath = await getBrowserExecutable();

    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--single-process",
    ];

    // @sparticuz/chromium provides its own args
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      try {
        const chromium = await import("@sparticuz/chromium");
        args.push(...(chromium.default.args || []));
      } catch {
        // ignore
      }
    }

    browser = await puppeteerCore.launch({
      executablePath,
      headless: true,
      args,
    });
    exportCount = 0;
  }
  return browser;
}

/**
 * Inline all image references in slide HTML.
 * For Vercel: /api/uploads/ paths. For local: /uploads/ paths.
 * Replaces with data: URIs for self-contained export.
 */
async function inlineImages(html: string): Promise<string> {
  const isVercel = !!process.env.VERCEL;

  // Match /uploads/ or /api/uploads/ paths
  const imgRegex = /(?:src=["']|url\(["']?)(\/(?:api\/)?uploads\/[^"'\s)]+)/g;
  const matches = [...html.matchAll(imgRegex)];

  let result = html;
  for (const match of matches) {
    const imgPath = match[1];
    try {
      let buffer: Buffer;
      if (isVercel) {
        // Read from /tmp/nugi-uploads
        const filename = imgPath.replace(/^\/api\/uploads\//, "");
        const fullPath = path.join("/tmp/nugi-uploads", filename);
        buffer = await readFile(fullPath);
      } else {
        const uploadDir = path.resolve(process.cwd(), "public");
        const fullPath = path.join(uploadDir, imgPath);
        buffer = await readFile(fullPath);
      }
      const ext = path.extname(imgPath).toLowerCase();
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "image/webp";
      const base64 = buffer.toString("base64");
      result = result.replace(imgPath, `data:${mime};base64,${base64}`);
    } catch {
      // Keep original path — Puppeteer can fetch from localhost
    }
  }

  return result;
}

/**
 * Export a single slide to PNG buffer.
 */
export async function exportSlide(
  slide: Slide,
  aspectRatio: AspectRatio
): Promise<Buffer> {
  const { width, height } = DIMENSIONS[aspectRatio];

  // Get inlined font CSS
  const fontFamilies = extractFontFamilies(slide.html);
  const inlinedFontCss = await getInlinedFontCSS(fontFamilies);

  // Inline images
  const inlinedHtml = await inlineImages(slide.html);

  // Build self-contained HTML
  const fullHtml = wrapSlideHtml(inlinedHtml, aspectRatio, {
    inlineFontCss: inlinedFontCss,
  });

  const br = await getBrowser();
  const page = await br.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Wait for fonts to be ready
    await page
      .waitForFunction(
        () =>
          document.fonts.ready.then(() =>
            [...document.fonts].every((f) => f.status === "loaded")
          ),
        { timeout: 10000 }
      )
      .catch(() => {
        // Font loading timeout — proceed with whatever loaded
      });

    const screenshotBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });

    exportCount++;

    // Post-process with Sharp: enforce sRGB
    const processed = await sharp(screenshotBuffer)
      .toColorspace("srgb")
      .png()
      .toBuffer();

    return processed;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Export all slides of a carousel to PNG buffers.
 * Processes up to 3 slides concurrently.
 */
export async function exportAllSlides(
  slides: Slide[],
  aspectRatio: AspectRatio,
  onProgress?: (current: number, total: number) => void
): Promise<{ name: string; buffer: Buffer }[]> {
  const results: { name: string; buffer: Buffer }[] = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < slides.length; i += CONCURRENCY) {
    const batch = slides.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (slide, batchIdx) => {
        const idx = i + batchIdx;
        const buffer = await exportSlide(slide, aspectRatio);
        onProgress?.(idx + 1, slides.length);
        return { name: `slide-${idx + 1}.png`, buffer };
      })
    );
    results.push(...batchResults);
  }

  return results;
}