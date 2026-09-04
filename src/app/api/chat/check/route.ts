import { NextResponse } from "next/server";

export async function GET() {
  const hasSumopod = !!process.env.SUMOPOD_API_KEY;
  const hasRunpod = !!process.env.RUNPOD_API_KEY;

  return NextResponse.json({
    available: hasSumopod,
    hasSumopod,
    hasRunpod,
    runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID || "wcxqunpceum6cw",
  });
}
