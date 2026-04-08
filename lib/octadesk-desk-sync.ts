import { supabase } from "@/lib/supabase";
import { getDeskOctadeskDailySyncTimeUtc, getDeskOctadeskSyncIntervalMinutes } from "@/lib/desk-sync-interval";
import { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { parseOctaDeskItem } from "@/lib/octadesk";
import { persistParsedOctaDeskLead } from "@/lib/ingest-octadesk-lead";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { extractOctadeskTicketList } from "@/lib/integrations/octadesk-probe";
import { DESK_PROVIDER_ACTIVE_KEY, getDeskProviderCredentialKeys } from "@/lib/integrations/providers";

/** Estado persistido por tenant para paginação de lista e rodízio de re-fetch de leads abertos. */
export const DESK_OCTADESK_SYNC_STATE_KEY = "desk.sync.octadesk.v1";

const LIST_TIMEOUT_MS = 22_000;
const DETAIL_TIMEOUT_MS = 18_000;
const DAILY_IMPORT_PAGE_LIMIT = 100;
const DAILY_IMPORT_MAX_PAGES = 80;
/** Conversas da lista a detalhar por tick (fase novos). */
export const OCTADESK_SYNC_LIST_DETAIL_BATCH = 6;
/** Leads com status `lead` a re-buscar por tick (fase SQL / tags). */
export const OCTADESK_SYNC_LEAD_SWEEP_BATCH = 6;
const BETWEEN_REQUESTS_MS = 90;

export type DeskOctadeskSyncStateV1 = {
  listPage: number;
  leadSweepOffset: number;
  /** ISO da ultima rodada completa (throttle por intervalo configurado). */
  lastRunAt: string | null;
};

export function defaultDeskOctadeskSyncState(): DeskOctadeskSyncStateV1 {
  return { listPage: 1, leadSweepOffset: 0, lastRunAt: null };
}

export function parseDeskOctadeskSyncState(raw: string | null | undefined): DeskOctadeskSyncStateV1 {
  if (raw == null || !String(raw).trim()) return defaultDeskOctadeskSyncState();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const listPage =
      typeof o.listPage === "number" && Number.isFinite(o.listPage) && o.listPage >= 1
        ? Math.floor(o.listPage)
        : 1;
    const leadSweepOffset =
      typeof o.leadSweepOffset === "number" && Number.isFinite(o.leadSweepOffset) && o.leadSweepOffset >= 0
        ? Math.floor(o.leadSweepOffset)
        : 0;
    const lastRunAtRaw = o.lastRunAt;
    const lastRunAt =
      typeof lastRunAtRaw === "string" && lastRunAtRaw.trim() && !Number.isNaN(new Date(lastRunAtRaw).getTime())
        ? lastRunAtRaw.trim()
        : null;
    return { listPage, leadSweepOffset, lastRunAt };
  } catch {
    return defaultDeskOctadeskSyncState();
  }
}

/**
 * Se false, o agendador bateu cedo demais; aguarde ate `nextEligibleAtIso`.
 */
export async function evaluateOctadeskSyncDueToInterval(partnerId: string): Promise<{
  shouldRun: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextEligibleAtIso: string | null;
}> {
  const intervalMinutes = await getDeskOctadeskSyncIntervalMinutes(partnerId);
  const dailyTimeUtc = await getDeskOctadeskDailySyncTimeUtc(partnerId);
  const state = await loadSyncState(partnerId);
  const lastRunAt = state.lastRunAt ?? null;
  if (intervalMinutes === 1440) {
    const [hhRaw, mmRaw] = dailyTimeUtc.split(":");
    const hh = Number.parseInt(hhRaw ?? "0", 10);
    const mm = Number.parseInt(mmRaw ?? "0", 10);
    const now = new Date();
    const targetToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number.isNaN(hh) ? 3 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0)
    );
    const targetTomorrow = new Date(targetToday.getTime() + 24 * 60 * 60 * 1000);
    if (!lastRunAt) {
      if (Date.now() >= targetToday.getTime()) {
        return { shouldRun: true, intervalMinutes, lastRunAt: null, nextEligibleAtIso: null };
      }
      return { shouldRun: false, intervalMinutes, lastRunAt: null, nextEligibleAtIso: targetToday.toISOString() };
    }
    const lastMs = new Date(lastRunAt).getTime();
    if (Number.isNaN(lastMs)) {
      return { shouldRun: true, intervalMinutes, lastRunAt, nextEligibleAtIso: null };
    }
    if (lastMs >= targetToday.getTime()) {
      return { shouldRun: false, intervalMinutes, lastRunAt, nextEligibleAtIso: targetTomorrow.toISOString() };
    }
    if (Date.now() >= targetToday.getTime()) {
      return { shouldRun: true, intervalMinutes, lastRunAt, nextEligibleAtIso: null };
    }
    return { shouldRun: false, intervalMinutes, lastRunAt, nextEligibleAtIso: targetToday.toISOString() };
  }

  if (!lastRunAt) {
    return { shouldRun: true, intervalMinutes, lastRunAt: null, nextEligibleAtIso: null };
  }
  const lastMs = new Date(lastRunAt).getTime();
  if (Number.isNaN(lastMs)) {
    return { shouldRun: true, intervalMinutes, lastRunAt, nextEligibleAtIso: null };
  }
  const elapsed = Date.now() - lastMs;
  const minMs = intervalMinutes * 60 * 1000;
  if (elapsed >= minMs) {
    return { shouldRun: true, intervalMinutes, lastRunAt, nextEligibleAtIso: null };
  }
  return {
    shouldRun: false,
    intervalMinutes,
    lastRunAt,
    nextEligibleAtIso: new Date(lastMs + minMs).toISOString(),
  };
}

export type OctadeskDeskSyncRoundResult = {
  partnerId: string;
  mode: "daily_previous_day" | "interval";
  targetDate: string | null;
  phaseNew: { page: number; listed: number; imported: number; skipped: number; failed: number; nextPage: number };
  phaseLeadSweep: {
    offset: number;
    picked: number;
    imported: number;
    skipped: number;
    failed: number;
    nextOffset: number;
    leadTotal: number;
  };
  errors: string[];
  durationMs: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function isoDatePartUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = iso.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function previousUtcDatePart(now = new Date()): string {
  const utcMidnightToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  return new Date(utcMidnightToday - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function loadSyncState(partnerId: string): Promise<DeskOctadeskSyncStateV1> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("partner_id", partnerId)
    .eq("key", DESK_OCTADESK_SYNC_STATE_KEY)
    .maybeSingle();
  return parseDeskOctadeskSyncState(data?.value ?? null);
}

async function saveSyncState(partnerId: string, state: DeskOctadeskSyncStateV1): Promise<void> {
  await supabase.from("app_settings").upsert(
    {
      partner_id: partnerId,
      key: DESK_OCTADESK_SYNC_STATE_KEY,
      value: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id,key" }
  );
}

/**
 * Uma rodada: (1) uma página de GET /chat + detalhes CTWA; (2) re-fetch de um lote de leads ainda `lead`.
 */
export async function runOctadeskDeskSyncRound(
  partnerId: string,
  baseUrl: string,
  apiToken: string
): Promise<OctadeskDeskSyncRoundResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const state = await loadSyncState(partnerId);
  const intervalMinutes = await getDeskOctadeskSyncIntervalMinutes(partnerId);
  const isDailyPreviousDayMode = intervalMinutes === 1440;
  const targetDate = isDailyPreviousDayMode ? previousUtcDatePart() : null;
  const sqlTagMarkersNormalized = normalizedMarkersForScan(await getDeskSqlTagMarkersForPartner(partnerId));

  let importedNew = 0;
  let skippedNew = 0;
  let failedNew = 0;
  let listed = 0;
  let nextPage = state.listPage;

  if (isDailyPreviousDayMode) {
    nextPage = 1;
    for (let page = 1; page <= DAILY_IMPORT_MAX_PAGES; page++) {
      const listPath = `/chat?page=${page}&limit=${DAILY_IMPORT_PAGE_LIMIT}`;
      const listRes = await octadeskApiGet(baseUrl, apiToken, listPath, LIST_TIMEOUT_MS);
      if (!listRes.ok || listRes.parsed == null) {
        errors.push(`GET /chat page=${page} HTTP ${listRes.status}`);
        break;
      }
      const chats = extractOctadeskTicketList(listRes.parsed);
      listed += chats.length;
      if (chats.length === 0) break;

      for (let i = 0; i < chats.length; i++) {
        const row = chats[i];
        if (!row || typeof row !== "object" || !("id" in row) || row.id == null) {
          skippedNew += 1;
          continue;
        }
        const rowCreatedAt = "createdAt" in row ? String((row as Record<string, unknown>).createdAt ?? "") : "";
        if (isoDatePartUtc(rowCreatedAt) !== targetDate) {
          skippedNew += 1;
          continue;
        }
        const id = encodeURIComponent(String(row.id));
        await sleep(BETWEEN_REQUESTS_MS);
        const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${id}`, DETAIL_TIMEOUT_MS);
        if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
          failedNew += 1;
          if (errors.length < 8) errors.push(`chat ${String(row.id).slice(0, 8)} HTTP ${detail.status}`);
          continue;
        }
        const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
        if (!parsed) {
          skippedNew += 1;
          continue;
        }
        if (isoDatePartUtc(parsed.createdAt) !== targetDate) {
          skippedNew += 1;
          continue;
        }
        const res = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: false });
        if (res.ok) importedNew += 1;
        else {
          failedNew += 1;
          if (errors.length < 8) errors.push(`${parsed.conversationId.slice(0, 8)} ${res.error}`);
        }
      }
    }
  } else {
    const listPath = `/chat?page=${state.listPage}&limit=${OCTADESK_SYNC_LIST_DETAIL_BATCH}`;
    const listRes = await octadeskApiGet(baseUrl, apiToken, listPath, LIST_TIMEOUT_MS);
    if (!listRes.ok || listRes.parsed == null) {
      errors.push(`GET /chat page=${state.listPage} HTTP ${listRes.status}`);
      nextPage = 1;
    } else {
      const chats = extractOctadeskTicketList(listRes.parsed);
      listed = chats.length;

      if (listed === 0) {
        nextPage = 1;
      } else {
        for (let i = 0; i < chats.length; i++) {
          const row = chats[i];
          if (!row || typeof row !== "object" || !("id" in row) || row.id == null) {
            skippedNew += 1;
            continue;
          }
          const id = encodeURIComponent(String(row.id));
          await sleep(BETWEEN_REQUESTS_MS);
          const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${id}`, DETAIL_TIMEOUT_MS);
          if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
            failedNew += 1;
            if (errors.length < 8) errors.push(`chat ${String(row.id).slice(0, 8)} HTTP ${detail.status}`);
            continue;
          }
          const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
          if (!parsed) {
            skippedNew += 1;
            continue;
          }
          const res = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: false });
          if (res.ok) importedNew += 1;
          else {
            failedNew += 1;
            if (errors.length < 8) errors.push(`${parsed.conversationId.slice(0, 8)} ${res.error}`);
          }
        }
        nextPage = listed < OCTADESK_SYNC_LIST_DETAIL_BATCH ? 1 : state.listPage + 1;
      }
    }
  }

  const { count: leadTotal = 0 } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("status", "lead");

  const total = leadTotal ?? 0;
  const offset = total === 0 ? 0 : state.leadSweepOffset % total;

  let leadRows: Array<{ id: string; conversation_id: string | null }> = [];
  if (isDailyPreviousDayMode) {
    for (let pOffset = 0; pOffset < total; pOffset += 200) {
      const { data: chunk } = await supabase
        .from("leads")
        .select("id, conversation_id")
        .eq("partner_id", partnerId)
        .eq("status", "lead")
        .order("id", { ascending: true })
        .range(pOffset, pOffset + 199);
      if (!chunk || chunk.length === 0) break;
      leadRows = leadRows.concat(chunk as Array<{ id: string; conversation_id: string | null }>);
    }
  } else {
    const { data } = await supabase
      .from("leads")
      .select("id, conversation_id")
      .eq("partner_id", partnerId)
      .eq("status", "lead")
      .order("id", { ascending: true })
      .range(offset, offset + OCTADESK_SYNC_LEAD_SWEEP_BATCH - 1);
    leadRows = (data ?? []) as Array<{ id: string; conversation_id: string | null }>;
  }

  let importedSweep = 0;
  let skippedSweep = 0;
  let failedSweep = 0;
  const picked = leadRows?.length ?? 0;

  for (const row of leadRows ?? []) {
    const convId = row.conversation_id?.trim();
    if (!convId) {
      skippedSweep += 1;
      continue;
    }
    const enc = encodeURIComponent(convId);
    await sleep(BETWEEN_REQUESTS_MS);
    const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${enc}`, DETAIL_TIMEOUT_MS);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      failedSweep += 1;
      if (errors.length < 8) errors.push(`sweep ${convId.slice(0, 8)} HTTP ${detail.status}`);
      continue;
    }
    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, { sqlTagMarkersNormalized });
    if (!parsed) {
      skippedSweep += 1;
      continue;
    }
    const res = await persistParsedOctaDeskLead(partnerId, parsed, { sendMetaConversion: false });
    if (res.ok) importedSweep += 1;
    else {
      failedSweep += 1;
      if (errors.length < 8) errors.push(`sweep ${parsed.conversationId.slice(0, 8)} ${res.error}`);
    }
  }

  const nextLeadOffset = total === 0 ? 0 : isDailyPreviousDayMode ? 0 : (offset + OCTADESK_SYNC_LEAD_SWEEP_BATCH) % total;

  await saveSyncState(partnerId, {
    listPage: nextPage,
    leadSweepOffset: nextLeadOffset,
    lastRunAt: new Date().toISOString(),
  });

  return {
    partnerId,
    mode: isDailyPreviousDayMode ? "daily_previous_day" : "interval",
    targetDate,
    phaseNew: {
      page: state.listPage,
      listed,
      imported: importedNew,
      skipped: skippedNew,
      failed: failedNew,
      nextPage,
    },
    phaseLeadSweep: {
      offset,
      picked,
      imported: importedSweep,
      skipped: skippedSweep,
      failed: failedSweep,
      nextOffset: nextLeadOffset,
      leadTotal: total,
    },
    errors,
    durationMs: Date.now() - t0,
  };
}

export type OctadeskCredentials = { baseUrl: string; apiToken: string };

/**
 * Credenciais Octadesk do tenant (service role).
 */
export async function loadOctadeskCredentialsForPartner(
  partnerId: string,
  decrypt: (enc: string) => string | null
): Promise<OctadeskCredentials | null> {
  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (error || !data?.length) return null;

  const baseUrlRaw = data.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = data.find((r) => r.key === keys.apiToken)?.value ?? "";
  const apiToken = tokenEnc ? decrypt(tokenEnc) ?? "" : "";
  const baseUrl = String(baseUrlRaw).trim();
  if (!baseUrl || !apiToken) return null;
  return { baseUrl, apiToken };
}

/**
 * Lista `partner_id` com Octadesk ativo e credenciais completas.
 */
export async function listPartnerIdsEligibleForOctadeskDeskSync(): Promise<string[]> {
  const keys = getDeskProviderCredentialKeys("octadesk");
  const keySet = [keys.baseUrl, keys.apiToken, DESK_PROVIDER_ACTIVE_KEY];
  const { data, error } = await supabase.from("app_settings").select("partner_id,key,value").in("key", keySet);

  if (error || !data) return [];

  const byPartner = new Map<string, { baseUrl?: string; apiToken?: string; active?: string }>();
  for (const row of data) {
    const pid = row.partner_id as string;
    if (!pid) continue;
    let slot = byPartner.get(pid);
    if (!slot) {
      slot = {};
      byPartner.set(pid, slot);
    }
    if (row.key === keys.baseUrl) slot.baseUrl = typeof row.value === "string" ? row.value : "";
    if (row.key === keys.apiToken) slot.apiToken = typeof row.value === "string" ? row.value : "";
    if (row.key === DESK_PROVIDER_ACTIVE_KEY) slot.active = typeof row.value === "string" ? row.value : "";
  }

  const out: string[] = [];
  for (const [partnerId, slot] of byPartner) {
    if (!slot.baseUrl?.trim()) continue;
    if (!slot.apiToken?.trim()) continue;
    if (slot.active != null && slot.active !== "" && slot.active !== "octadesk") continue;
    out.push(partnerId);
  }
  return out;
}
