/** Mask account numbers and common PII patterns for UI display. */

export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return "••••••••";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export function maskDescription(description: string): string {
  let masked = description;
  // Long digit runs (card / account)
  masked = masked.replace(/\b\d{8,}\b/g, (m) => `••••${m.slice(-4)}`);
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

export function extractAccountHint(text: string): string {
  const match =
    text.match(/account\s*(?:no|number|#)?[:\s]*([A-Z0-9*]{6,})/i) ||
    text.match(/\b(\d{10,18})\b/);
  if (!match) return "••••••••";
  return maskAccountNumber(match[1]);
}
