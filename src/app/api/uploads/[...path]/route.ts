import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const isVercel = !!process.env.VERCEL;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const filename = pathSegments.join("/");

  const normalised = path.normalize(filename);
  if (normalised.startsWith("..") || path.isAbsolute(normalised)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const uploadDir = isVercel
    ? "/tmp/nugi-uploads"
    : path.resolve(process.cwd(), "public/uploads");

  const fullPath = path.join(uploadDir, normalised);

  if (!fullPath.startsWith(uploadDir)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const buffer = await readFile(fullPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".woff2"
              ? "font/woff2"
              : ext === ".ttf"
                ? "font/ttf"
                : "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}