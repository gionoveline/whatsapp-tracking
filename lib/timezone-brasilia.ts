/**
 * Conversões simples HH:mm entre UTC e horário de Brasília (UTC-3).
 * Mantemos armazenamento em UTC no backend e exibimos em Brasília na UI.
 */

function parseTime(value: string): { hh: number; mm: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hh: Number.parseInt(m[1], 10), mm: Number.parseInt(m[2], 10) };
}

function toHHmm(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function utcTimeToBrasilia(utcHHmm: string): string {
  const parsed = parseTime(utcHHmm);
  if (!parsed) return "00:00";
  const total = parsed.hh * 60 + parsed.mm;
  // UTC-3
  return toHHmm(total - 180);
}

export function brasiliaTimeToUtc(brasiliaHHmm: string): string {
  const parsed = parseTime(brasiliaHHmm);
  if (!parsed) return "03:00";
  const total = parsed.hh * 60 + parsed.mm;
  // UTC+3
  return toHHmm(total + 180);
}

