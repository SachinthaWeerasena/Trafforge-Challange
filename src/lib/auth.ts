import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  type SessionUser,
} from "./auth-session";

export {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  type SessionUser,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** Server Components / Route Handlers via next/headers cookies() */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true },
  });
  return user;
}

/** API routes that have NextRequest */
export async function getSessionUserFromRequest(
  req: NextRequest
): Promise<SessionUser | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true },
  });
  return user;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}
