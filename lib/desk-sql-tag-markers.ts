import { supabase } from "@/lib/supabase";

/** JSON array de strings em `app_settings`; ausente = usar defaults. */
export const DESK_SQL_TAG_MARKERS_KEY = "desk.sqlTagMarkers";

/** Marcadores padrão (texto humano; comparacao ignora maiusculas e acentos). */
export const DEFAULT_DESK_SQL_TAG_MARKERS = [
  "Oportunidade atualizada",
  "Oportunidade criada",
  "Optou por falar com consultor",
] as const;

const MAX_MARKERS = 40;
const MAX_MARKER_LENGTH = 200;

export function normalizeMarkerForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function parseStoredSqlTagMarkers(raw: string | null | undefined): string[] | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    const out: string[] = [];
    for (const el of arr) {
      if (typeof el === "string" && el.trim()) out.push(el.trim());
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export function sanitizeSqlTagMarkersInput(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of input) {
    const t = typeof el === "string" ? el.trim().slice(0, MAX_MARKER_LENGTH) : "";
    if (!t) continue;
    const k = normalizeMarkerForMatch(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_MARKERS) break;
  }
  return out;
}

export function normalizedMarkersForScan(markers: readonly string[]): string[] {
  return markers.map((m) => normalizeMarkerForMatch(m)).filter(Boolean);
}

export async function getDeskSqlTagMarkersForPartner(
  partnerId: string,
  client = supabase
): Promise<string[]> {
  const { data } = await client
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_SQL_TAG_MARKERS_KEY)
    .maybeSingle();

  const parsed = parseStoredSqlTagMarkers(data?.value ?? null);
  if (parsed && parsed.length > 0) return parsed;
  return [...DEFAULT_DESK_SQL_TAG_MARKERS];
}
