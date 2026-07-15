export type PdfReadResult = {
  text: string;
  pageCount: number;
  charCount: number;
};

/**
 * Unlock (if needed) and extract readable text + table rows from a PDF.
 * Copies the buffer so pdf.js worker transfer does not wipe the original.
 */
export async function readPdfDocument(
  fileBuffer: Buffer,
  password?: string
): Promise<PdfReadResult> {
  const { PDFParse } = await import("pdf-parse");
  const data = new Uint8Array(fileBuffer);

  const parser = new PDFParse({
    data,
    ...(password ? { password } : {}),
  });

  try {
    const textResult = await parser.getText({
      lineEnforce: true,
      cellSeparator: "\t",
      cellThreshold: 6,
      pageJoiner: "\n\n--- page_number / total_number ---\n\n",
    });

    let text = (textResult.text ?? "").trim();

    // Tables often retain structure better on bank PDFs
    try {
      const tableResult = await parser.getTable();
      const tableLines: string[] = [];
      const tables = tableResult.mergedTables?.length
        ? tableResult.mergedTables
        : (tableResult.pages ?? []).flatMap((p) => p.tables ?? []);

      for (const table of tables) {
        for (const row of table) {
          const cells = row.map((c) => String(c ?? "").trim()).filter(Boolean);
          if (cells.length >= 2) tableLines.push(cells.join("\t"));
        }
      }

      if (tableLines.length) {
        const tableBlock = tableLines.join("\n");
        text = text ? `${text}\n\n${tableBlock}` : tableBlock;
      }
    } catch {
      /* table parse is best-effort */
    }

    const pageCount = textResult.total ?? textResult.pages?.length ?? 0;
    return {
      text,
      pageCount,
      charCount: text.length,
    };
  } finally {
    await parser.destroy?.();
  }
}

export function isPdfPasswordError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  return (
    name === "PasswordException" ||
    /password/i.test(msg) ||
    /PasswordException/i.test(name) ||
    /No password given/i.test(msg) ||
    /Incorrect password/i.test(msg) ||
    /Need to authenticate/i.test(msg)
  );
}
