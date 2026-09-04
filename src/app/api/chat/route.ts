import { NextRequest, NextResponse } from "next/server";
import { streamLLM } from "@/lib/ai/llm";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand } from "@/lib/brand";
import { getCarousel } from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";
import { executeCarouselAction } from "@/lib/ai/actions";
import type { ChatMessage } from "@/lib/ai/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: {
    message?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    carouselId?: string;
    stylePresetId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, conversationHistory = [], carouselId, stylePresetId } = body;

  if (
    !message ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 10000
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  if (!process.env.SUMOPOD_API_KEY) {
    return NextResponse.json(
      {
        error:
          "SUMOPOD_API_KEY belum diatur di Environment Variables. Buka Vercel Dashboard > Project Settings > Environment Variables, tambahkan SUMOPOD_API_KEY, lalu Redeploy.",
      },
      { status: 500 }
    );
  }

  // Build dynamic system prompt with current brand + carousel + style preset context
  const brand = await getBrand();
  const carousel = carouselId ? await getCarousel(carouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset);

  // Build messages array: system + conversation history + new user message
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const abortController = new AbortController();

  // Forward the stream from SumoPod to the client, executing carousel actions
  const stream = streamLLM(
    messages,
    abortController.signal,
    async (action) => {
      if (carouselId) {
        return await executeCarouselAction(carouselId, action);
      }
      return "";
    }
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
