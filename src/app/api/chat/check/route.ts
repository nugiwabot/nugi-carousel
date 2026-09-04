import { NextResponse } from "next/server";

// AI is always available via SumoPod API (no local CLI required).
// This endpoint is kept for backwards compatibility.
export async function GET() {
  return NextResponse.json({ available: true });
}
