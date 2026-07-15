import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { parseCsvStatement } from "@/lib/csv-parser";
import { detectCurrency } from "@/lib/currency";
import { prisma } from "@/lib/db";
import {
  buildDeterministicSummary,
  computeInsights,
  enrichTransactions,
} from "@/lib/insights";
import { extractAccountHint } from "@/lib/privacy";
import { isPdfPasswordError, readPdfDocument } from "@/lib/pdf-reader";
import {
  aiCategorizeTransactions,
  createAiMeta,
  extractTransactionsFromPdfText,
  generateAiCoachInsights,
  generateAiSummary,
  isAiConfigured,
} from "@/lib/openai";
import type { RawTransaction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const optInStore = form.get("optInStore") === "true";
    const passwordRaw = form.get("password");
    const pdfPassword =
      typeof passwordRaw === "string" && passwordRaw.trim() ? passwordRaw.trim() : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let raw: RawTransaction[] = [];
    let sourceText = "";
    let currency = "USD";
    let currencySource = "default";
    const aiMeta = createAiMeta();

    const isCsv =
      name.endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "application/csv" ||
      file.type === "application/vnd.ms-excel" ||
      (file.type === "application/octet-stream" && name.endsWith(".csv")) ||
      (file.type === "text/plain" && name.endsWith(".csv"));

    if (isCsv) {
      sourceText = buffer.toString("utf-8").replace(/^\uFEFF/, "");
      try {
        const parsed = parseCsvStatement(sourceText);
        raw = parsed.transactions;
        currency = parsed.currency;
        currencySource = parsed.currencySource;
      } catch (csvErr) {
        return NextResponse.json(
          {
            error:
              csvErr instanceof Error
                ? csvErr.message
                : "Could not parse CSV statement.",
            code: "CSV_PARSE_FAILED",
          },
          { status: 422 }
        );
      }
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
      let pageCount = 0;
      try {
        const pdf = await readPdfDocument(buffer, pdfPassword);
        sourceText = pdf.text;
        pageCount = pdf.pageCount;
      } catch (pdfErr) {
        if (isPdfPasswordError(pdfErr)) {
          return NextResponse.json(
            {
              error: pdfPassword
                ? "Incorrect PDF password. Check the password and try again."
                : "This PDF is password-protected. Enter the password below and analyze again.",
              code: "PASSWORD_REQUIRED",
            },
            { status: 401 }
          );
        }
        const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        return NextResponse.json(
          { error: `Could not read PDF: ${msg}` },
          { status: 422 }
        );
      }

      if (!sourceText.trim()) {
        return NextResponse.json(
          {
            error: pdfPassword
              ? "PDF unlocked, but no selectable text was found. This file looks scanned/image-based — export a text PDF or CSV from your bank and try again."
              : "No selectable text found in this PDF. It may be scanned — try a text-based PDF or CSV export.",
            code: "PDF_NO_TEXT",
          },
          { status: 422 }
        );
      }

      const extracted = await extractTransactionsFromPdfText(sourceText, aiMeta);
      raw = extracted.transactions;
      const detected = detectCurrency({
        text: sourceText,
        aiHint: extracted.currencyHint,
      });
      currency = detected.code;
      currencySource = extracted.currencyHint ? "ai+text" : detected.source;
      if (!raw.length) {
        return NextResponse.json(
          {
            error: `PDF opened (${pageCount || "?"} page${pageCount === 1 ? "" : "s"}, ${sourceText.length} characters) but no transaction rows could be parsed. Try CSV, or a clearer text export from the bank.`,
            code: "PDF_NO_TXNS",
          },
          { status: 422 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or CSV." },
        { status: 400 }
      );
    }

    if (!raw.length) {
      return NextResponse.json({ error: "No transactions found" }, { status: 422 });
    }

    let transactions = enrichTransactions(raw);
    const isCsvUpload =
      name.endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "application/csv";

    if (isAiConfigured()) {
      // Don't let slow AI providers hang CSV/PDF analysis forever
      const aiMap = await withTimeout(
        aiCategorizeTransactions(
          transactions.map((t) => ({
            date: t.date,
            description: t.description,
            category: t.category,
            categoryConfidence: t.categoryConfidence,
          })),
          aiMeta
        ),
        isCsvUpload ? 12000 : 20000
      );
      if (aiMap && aiMap.size > 0) {
        transactions = enrichTransactions(raw, aiMap);
      }
    }

    const accountSource = [
      sourceText,
      ...raw.map((t) => t.reference ?? ""),
      ...raw.slice(0, 5).map((t) => t.description ?? ""),
    ].join(" ");
    const accountMask = extractAccountHint(accountSource);

    let analysis = computeInsights(
      transactions,
      accountMask,
      "",
      aiMeta.used,
      currency,
      currencySource
    );

    const summaryContext = {
      currency: analysis.currency,
      totalIncome: analysis.totalIncome,
      totalExpenses: analysis.totalExpenses,
      savingsRate: analysis.savingsRate,
      topCategories: analysis.topCategories.map((c) => ({
        category: c.category,
        total: c.total,
        percentOfExpenses: c.percentOfExpenses,
      })),
      cashFlow: analysis.cashFlow.map((c) => ({
        month: c.month,
        inflows: c.inflows,
        outflows: c.outflows,
        net: c.net,
      })),
      unusualSpikes: analysis.unusualSpikes.map((s) => ({
        description: s.description,
        amount: s.amount,
      })),
    };

    const aiSummary = isAiConfigured()
      ? await withTimeout(generateAiSummary(summaryContext, aiMeta), 12000)
      : null;
    const naturalLanguageSummary =
      aiSummary ?? buildDeterministicSummary(analysis);

    let aiCoachTips: string[] = [];
    let aiAnomalyInsight = "";

    if (isAiConfigured()) {
      const coach = await withTimeout(
        generateAiCoachInsights(
          {
            currency: analysis.currency,
            totalIncome: analysis.totalIncome,
            totalExpenses: analysis.totalExpenses,
            savingsRate: analysis.savingsRate,
            topCategories: summaryContext.topCategories,
            recurring: analysis.recurringPayments.map((r) => ({
              merchant: r.merchant,
              averageAmount: r.averageAmount,
              occurrences: r.occurrences,
            })),
            bonus: {
              duplicateCount: analysis.bonus.duplicateCharges.length,
              feeCount: analysis.bonus.hiddenFees.length,
              cashPct: analysis.bonus.cashHeavy.cashPctOfExpenses,
              salaryNote: analysis.bonus.salaryConsistency.note,
              ruleSuggestions: analysis.bonus.savingSuggestions,
            },
          },
          aiMeta
        ),
        12000
      );
      if (coach) {
        aiCoachTips = coach.tips;
        aiAnomalyInsight = coach.anomalyInsight;
      }
    }

    const mergedSuggestions = [
      ...aiCoachTips,
      ...analysis.bonus.savingSuggestions.filter(
        (s) => !aiCoachTips.some((t) => t.toLowerCase().includes(s.slice(0, 24).toLowerCase()))
      ),
    ].slice(0, 6);

    analysis = {
      ...analysis,
      naturalLanguageSummary,
      aiCoachTips,
      aiUsed: aiMeta.used,
      aiProvider: aiMeta.provider,
      aiFeatures: aiMeta.features,
      bonus: {
        ...analysis.bonus,
        savingSuggestions: mergedSuggestions,
        aiAnomalyInsight: aiAnomalyInsight || undefined,
      },
    };

    const sessionUser = await getSessionUserFromRequest(req);
    let savedStatementId: string | null = null;
    let stored = false;
    let privacyNote =
      "Guest mode: raw statement processed in memory only — nothing saved to the database.";

    // Authenticated → persist processed results (not raw file bytes) linked to user_id
    // Guest → never write statement history
    if (sessionUser) {
      const row = await prisma.statement.create({
        data: {
          userId: sessionUser.id,
          fileName: file.name,
          fileType: file.type || (name.endsWith(".pdf") ? "application/pdf" : "text/csv"),
          currency: analysis.currency,
          transactionCount: transactions.length,
          processedData: JSON.stringify(analysis),
        },
        select: { id: true },
      });
      savedStatementId = row.id;
      stored = true;
      privacyNote =
        "Signed-in mode: processed insights were saved to your account history. Raw file bytes were not stored.";
    } else if (optInStore) {
      privacyNote =
        "Guest mode ignores store opt-in — sign in to keep statement history.";
    }

    return NextResponse.json({
      analysis,
      meta: {
        fileName: file.name,
        transactionCount: transactions.length,
        currency: analysis.currency,
        currencySource: analysis.currencySource,
        mode: sessionUser ? "authenticated" : "guest",
        optInStore,
        stored,
        statementId: savedStatementId,
        ai: {
          configured: isAiConfigured(),
          used: aiMeta.used,
          provider: aiMeta.provider,
          features: aiMeta.features,
        },
        privacyNote,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
