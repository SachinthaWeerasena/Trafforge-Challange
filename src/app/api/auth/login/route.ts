import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AUTH_COOKIE,
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
  validateCredentials,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    const invalid = validateCredentials(email, password);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const token = await createSessionToken({ id: user.id, email: user.email });
    const res = NextResponse.json({
      user: { id: user.id, email: user.email },
      mode: "authenticated",
    });
    res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
