import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: {
    prompt?: string;
    width?: number;
    height?: number;
    negativePrompt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, width = 1024, height = 1024, negativePrompt } = body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "prompt too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  try {
    const imageDataUri = await generateImage(
      prompt.trim(),
      width,
      height,
      negativePrompt
    );
    return NextResponse.json({ imageDataUri });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Image generation failed. Please check your RunPod configuration.";
    console.error("[generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
