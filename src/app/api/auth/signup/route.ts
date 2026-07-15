import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AUTH_COOKIE,
  createSessionToken,
  hashPassword,
  normalizeEmail,
  sessionCookieOptions,
  validateCredentials,
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    const token = await createSessionToken({ id: user.id, email: user.email });
    const res = NextResponse.json({
      user: { id: user.id, email: user.email },
      mode: "authenticated",
    });
    res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
  }
}
