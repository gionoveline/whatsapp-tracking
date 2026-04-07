import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { decryptAppSettingValue } from "@/lib/app-settings-crypto";
import { getDeskProviderCredentialKeys } from "@/lib/integrations/providers";
import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";
import { octadeskApiGet } from "@/lib/integrations/octadesk-http";
import { parseOctaDeskItem } from "@/lib/octadesk";
import { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";

export const maxDuration = 60;

type LeadStatus = "lead" | "sql" | "venda";

function resolveNextStatus(existing: LeadStatus, hasSqlOpportunityTag: boolean): LeadStatus {
  if (existing === "venda") return "venda";
  return hasSqlOpportunityTag ? "sql" : "lead";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:desk-reprocess-sql:${user.id}:${ip}`, 3, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { dryRun?: unknown; maxLeads?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const maxLeadsRaw =
    typeof body.maxLeads === "number" && Number.isFinite(body.maxLeads) ? Math.floor(body.maxLeads) : 500;
  const maxLeads = Math.min(1000, Math.max(1, maxLeadsRaw));

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: settingsErr } = await supabaseUser
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);

  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  }

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(String(tokenEnc)) ?? "" : "";
  if (!baseUrl || !apiToken) {
    return NextResponse.json({ error: "Configure as credenciais do Desk antes." }, { status: 400 });
  }

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId, supabaseUser);
  const sqlMarkersNorm = normalizedMarkersForScan(sqlMarkers);

  const { data: rows, error: rowsErr } = await supabaseUser
    .from("leads")
    .select("id,conversation_id,status")
    .eq("partner_id", partnerId)
    .in("status", ["lead", "sql", "venda"])
    .order("id", { ascending: true })
    .limit(maxLeads);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  let scanned = 0;
  let detailOk = 0;
  let detailFail = 0;
  let parseFail = 0;
  let noConversation = 0;
  let unchanged = 0;
  let wouldChange = 0;
  let changed = 0;
  let updateFail = 0;
  let toLead = 0;
  let toSql = 0;
  let keptVenda = 0;

  for (const row of rows ?? []) {
    scanned += 1;
    const currentStatus = String(row.status ?? "") as LeadStatus;
    if (currentStatus === "venda") {
      keptVenda += 1;
      continue;
    }

    const convId = String(row.conversation_id ?? "").trim();
    if (!convId) {
      noConversation += 1;
      continue;
    }

    const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${encodeURIComponent(convId)}`, 20000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
      detailFail += 1;
      await sleep(80);
      continue;
    }
    detailOk += 1;

    const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
      sqlTagMarkersNormalized: sqlMarkersNorm,
    });
    if (!parsed) {
      parseFail += 1;
      await sleep(80);
      continue;
    }

    const nextStatus = resolveNextStatus(currentStatus, parsed.hasSqlOpportunityTag);
    if (nextStatus === currentStatus) {
      unchanged += 1;
      await sleep(80);
      continue;
    }

    wouldChange += 1;
    if (nextStatus === "lead") toLead += 1;
    if (nextStatus === "sql") toSql += 1;

    if (!dryRun) {
      const { error: upErr } = await supabaseUser
        .from("leads")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("partner_id", partnerId);

      if (upErr) updateFail += 1;
      else changed += 1;
    }

    await sleep(80);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    maxLeads,
    sqlMarkersConfigured: sqlMarkers,
    processed: {
      scanned,
      detailOk,
      detailFail,
      parseFail,
      noConversation,
      keptVenda,
    },
    reclassification: {
      unchanged,
      wouldChange,
      changed: dryRun ? 0 : changed,
      updateFail: dryRun ? 0 : updateFail,
      toLead,
      toSql,
    },
  });
}

