import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, mode: "guest" });
  }
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    mode: "authenticated",
  });
}
