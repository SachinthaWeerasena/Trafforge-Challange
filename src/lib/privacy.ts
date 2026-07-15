/** Mask account numbers and common PII patterns for UI display. */

/**
 * Keep the last 4 digits readable; mask everything before them.
 * e.g. 800123456789 → ••••••••6789
 */
export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return "••••";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "••••";
  if (digits.length <= 4) return `••••${digits}`;
  const last4 = digits.slice(-4);
  const maskedCount = Math.min(digits.length - 4, 12);
  return `${"•".repeat(maskedCount)}${last4}`;
}

export function maskDescription(description: string): string {
  let masked = description;
  // Long digit runs (card / account) — last 4 readable
  masked = masked.replace(/\b\d{8,}\b/g, (m) => maskAccountNumber(m));
  // Partial card patterns
  masked = masked.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, (m) => {
    const last4 = m.replace(/\D/g, "").slice(-4);
    return `•••• •••• •••• ${last4}`;
  });
  // Email
  masked = masked.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (m) => `${m[0]}***@***.***`
  );
  // Phone-ish
  masked = masked.replace(/\b(?:\+?\d[\d\s\-()]{8,}\d)\b/g, "•••-••••");
  return masked;
}

/** Pull the best account-number candidate from statement text / refs. */
export function extractAccountHint(text: string): string {
  const candidates: string[] = [];

  const patterns = [
    /account\s*(?:no|number|num|#)?\s*[:.\-]\s*([A-Z0-9][A-Z0-9\s\-]{5,})/i,
    /a\/c\s*(?:no|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\s\-]{5,})/i,
    /acc(?:ount)?\s*[:.\-]\s*([A-Z0-9][A-Z0-9\s\-]{5,})/i,
    /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{2,6})\b/,
    /\b(\d{10,18})\b/g,
  ];

  for (const pattern of patterns) {
    if (pattern.global) {
      for (const m of text.matchAll(pattern)) {
        if (m[1]) candidates.push(m[1]);
      }
    } else {
      const m = text.match(pattern);
      if (m?.[1]) candidates.push(m[1]);
    }
  }

  // Prefer the longest digit run (likely a full account number)
  let best: string | null = null;
  let bestLen = 0;
  for (const c of candidates) {
    const digits = c.replace(/\D/g, "");
    if (digits.length >= 4 && digits.length > bestLen) {
      best = digits;
      bestLen = digits.length;
    }
  }

  if (!best) return "••••";
  return maskAccountNumber(best);
}
