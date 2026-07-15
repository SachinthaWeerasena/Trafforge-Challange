import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view statement history.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const row = await prisma.statement.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!row) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(row.processedData) as AnalysisResult;
  } catch {
    return NextResponse.json(
      { error: "Stored analysis is corrupted" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    statement: {
      id: row.id,
      fileName: row.fileName,
      fileType: row.fileType,
      currency: row.currency,
      transactionCount: row.transactionCount,
      uploadDate: row.uploadDate,
    },
    analysis,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const existing = await prisma.statement.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  await prisma.statement.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
