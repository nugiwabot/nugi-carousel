import { NextResponse } from "next/server";
import { upsertCarousel } from "@/lib/carousels";
import type { Carousel } from "@/types/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Carousel;
    const carousel = await upsertCarousel({
      ...body,
      id,
    });
    return NextResponse.json({ success: true, carousel });
  } catch (error) {
    console.error("[sync] Carousel sync error:", error);
    return NextResponse.json({ error: "Invalid carousel data" }, { status: 400 });
  }
}
