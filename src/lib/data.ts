import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import { Mutex } from "async-mutex";

// Use /tmp for Vercel compatibility. Vercel's filesystem is read-only except /tmp.
// NOTE: /tmp data is ephemeral and does NOT persist across Vercel cold starts.
// For production persistence, add Vercel KV or a database.
const DATA_DIR =
  process.env.VERCEL || process.env.NODE_ENV === "production"
    ? "/tmp/nugi-data"
    : path.resolve(process.cwd(), "data");

const mutexes = new Map<string, Mutex>();

function getMutex(filename: string): Mutex {
  let mutex = mutexes.get(filename);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(filename, mutex);
  }
  return mutex;
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readData<T>(filename: string): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Data file not found: ${filename}`);
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Data file corrupted: ${filename} — ${err.message}`);
    }
    throw err;
  }
}

export async function writeData<T>(filename: string, data: T): Promise<void> {
  const mutex = getMutex(filename);
  await mutex.runExclusive(async () => {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    const tmpPath = filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  });
}

export async function readDataSafe<T>(filename: string, fallback: T): Promise<T> {
  try {
    return await readData<T>(filename);
  } catch {
    return fallback;
  }
}
