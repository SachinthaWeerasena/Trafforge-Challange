import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-session";

/**
 * Edge-safe guard: require session cookie present.
 * Full JWT + user validation happens in Node route handlers.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to access statement history.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/statements/:path*"],
};
