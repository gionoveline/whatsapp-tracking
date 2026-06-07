import { createHash } from "node:crypto";

export type GoogleEnhancedUserIdentifiers = {
  hashedPhoneNumber?: string;
  hashedEmail?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza e-mail para hash Google (trim + lowercase). */
export function normalizeEmailForGoogle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return email.slice(0, 254);
}

/** Normaliza telefone BR/WhatsApp para E.164 (+55…). */
export function normalizePhoneE164ForGoogle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function sha256HexLower(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashEmailForGoogle(raw: string | null | undefined): string | null {
  const normalized = normalizeEmailForGoogle(raw);
  if (!normalized) return null;
  return sha256HexLower(normalized);
}

export function hashPhoneForGoogle(raw: string | null | undefined): string | null {
  const normalized = normalizePhoneE164ForGoogle(raw);
  if (!normalized) return null;
  return sha256HexLower(normalized);
}

export function buildGoogleEnhancedUserIdentifiers(input: {
  contactPhone?: string | null;
  contactEmail?: string | null;
  usePhone?: boolean;
  useEmail?: boolean;
}): GoogleEnhancedUserIdentifiers {
  const out: GoogleEnhancedUserIdentifiers = {};
  if (input.usePhone !== false) {
    const hashedPhoneNumber = hashPhoneForGoogle(input.contactPhone);
    if (hashedPhoneNumber) out.hashedPhoneNumber = hashedPhoneNumber;
  }
  if (input.useEmail !== false) {
    const hashedEmail = hashEmailForGoogle(input.contactEmail);
    if (hashedEmail) out.hashedEmail = hashedEmail;
  }
  return out;
}

/** Extrai e-mail de texto livre (mensagem Octadesk). */
export function extractEmailFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!match) return null;
  return normalizeEmailForGoogle(match[0]);
}
