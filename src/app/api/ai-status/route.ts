import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/ai-client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAiStatus());
}
