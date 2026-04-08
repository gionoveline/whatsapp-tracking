import { supabase } from "@/lib/supabase";

/** Minutos entre execucoes efetivas do sync Octadesk por tenant (agendador pode bater mais cedo; o backend ignora ate passar o intervalo). */
export const DESK_OCTADESK_SYNC_INTERVAL_KEY = "desk.sync.octadesk.intervalMinutes";
export const DESK_OCTADESK_DAILY_SYNC_TIME_KEY = "desk.sync.octadesk.dailyTimeUtc";

/** Opcoes exibidas na UI (Free: use agendador HTTP com frequencia <= escolhida; Pro: alinhar vercel.json ou intervalo >= periodo do cron). */
export const DESK_OCTADESK_SYNC_INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 1440] as const;

export type DeskOctadeskSyncIntervalOption = (typeof DESK_OCTADESK_SYNC_INTERVAL_OPTIONS)[number];

export const DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES: DeskOctadeskSyncIntervalOption = 1440;
export const DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC = "00:00";

export function sanitizeDeskOctadeskIntervalMinutes(raw: unknown): DeskOctadeskSyncIntervalOption {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : Number.NaN;
  if (DESK_OCTADESK_SYNC_INTERVAL_OPTIONS.includes(n as DeskOctadeskSyncIntervalOption)) {
    return n as DeskOctadeskSyncIntervalOption;
  }
  return DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES;
}

export function sanitizeDailySyncTimeUtc(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return DEFAULT_DESK_OCTADESK_DAILY_SYNC_TIME_UTC;
  return `${m[1]}:${m[2]}`;
}

export async function getDeskOctadeskSyncIntervalMinutes(
  partnerId: string,
  client = supabase
): Promise<DeskOctadeskSyncIntervalOption> {
  const { data } = await client
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_OCTADESK_SYNC_INTERVAL_KEY)
    .maybeSingle();

  const raw = data?.value;
  const parsed =
    typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : Number.NaN;
  return sanitizeDeskOctadeskIntervalMinutes(parsed);
}

export async function getDeskOctadeskDailySyncTimeUtc(partnerId: string, client = supabase): Promise<string> {
  const { data } = await client
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_OCTADESK_DAILY_SYNC_TIME_KEY)
    .maybeSingle();
  return sanitizeDailySyncTimeUtc(data?.value);
}
