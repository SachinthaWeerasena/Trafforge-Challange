import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** List statements for the authenticated user only. Guests get 401. */
export async function GET(req: NextRequest) {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view statement history.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const statements = await prisma.statement.findMany({
    where: { userId: user.id },
    orderBy: { uploadDate: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      currency: true,
      transactionCount: true,
      uploadDate: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ statements });
}
