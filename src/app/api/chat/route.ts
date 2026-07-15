import { NextRequest, NextResponse } from "next/server";
import { chatAboutStatement } from "@/lib/openai";
import type { AnalysisResult, ChatMessage, Transaction } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question?: string;
      transactions?: Transaction[];
      history?: ChatMessage[];
      analysisHint?: Pick<
        AnalysisResult,
        | "totalIncome"
        | "totalExpenses"
        | "savingsRate"
        | "topCategories"
        | "naturalLanguageSummary"
        | "currency"
      >;
    };

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    if (!body.transactions?.length) {
      return NextResponse.json(
        { error: "No statement context. Analyze a statement first." },
        { status: 400 }
      );
    }

    const { answer, provider } = await chatAboutStatement(
      body.question.trim(),
      body.transactions,
      body.history ?? [],
      body.analysisHint
    );

    return NextResponse.json({ answer, provider });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
