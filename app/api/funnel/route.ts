import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Agregação do funil por campanha (e ad set / ad): leads, opps, ganhos.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("leads")
    .select("id, campaign_id, campaign_name, adset_id, adset_name, ad_name, source_id, status, created_at");

  if (from) {
    query = query.gte("created_at", `${from}T00:00:00.000Z`);
  }
  if (to) {
    query = query.lte("created_at", `${to}T23:59:59.999Z`);
  }

  const { data: rows, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Bucket = { campaignId: string; campaignName: string; adsetId: string; adsetName: string; adName: string; adId: string; leads: number; sql: number; venda: number };
  type DailyBucket = { date: string; leads: number; sql: number; venda: number };
  const byCampaign = new Map<string, Bucket>();
  const byDay = new Map<string, DailyBucket>();

  for (const row of rows ?? []) {
    const campaignId = row.campaign_id ?? "_unknown";
    const campaignName = row.campaign_name ?? "Sem campanha";
    const adsetId = row.adset_id ?? "_unknown";
    const adsetName = row.adset_name ?? "Sem conjunto de anúncios";
    const adName = row.ad_name ?? "Sem anúncio";
    const adId = row.source_id ?? "_unknown";
    const key = `${campaignId}|${adsetId}|${adId}`;

    if (!byCampaign.has(key)) {
      byCampaign.set(key, {
        campaignId,
        campaignName,
        adsetId,
        adsetName,
        adName,
        adId,
        leads: 0,
        sql: 0,
        venda: 0,
      });
    }
    const b = byCampaign.get(key)!;
    b.leads += 1;
    if (row.status === "sql" || row.status === "venda") b.sql += 1;
    if (row.status === "venda") b.venda += 1;

    const dateKey = new Date(row.created_at).toISOString().slice(0, 10);
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, { date: dateKey, leads: 0, sql: 0, venda: 0 });
    }
    const d = byDay.get(dateKey)!;
    d.leads += 1;
    if (row.status === "sql" || row.status === "venda") d.sql += 1;
    if (row.status === "venda") d.venda += 1;
  }

  const funnel = Array.from(byCampaign.values()).sort(
    (a, b) => (b.venda - a.venda) || (b.sql - a.sql) || (b.leads - a.leads)
  );

  const timeSeries = Array.from(byDay.values())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => ({
      ...d,
      conversionRate: d.leads > 0 ? Math.round((d.venda / d.leads) * 1000) / 10 : 0,
    }));

  return NextResponse.json({
    from: from ?? null,
    to: to ?? null,
    totalLeads: rows?.length ?? 0,
    funnel,
    timeSeries,
  });
}
