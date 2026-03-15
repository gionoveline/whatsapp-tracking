import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { META_CAPI_EVENT_NAMES, getMetaCapiConfig, type MetaCapiMapping } from "@/lib/meta-conversions";

/**
 * GET /api/settings/meta-conversions
 * Retorna configuração CAPI (sem token).
 */
export async function GET() {
  const config = await getMetaCapiConfig();
  return NextResponse.json({
    waba_id: config.waba_id ?? "",
    dataset_id: config.dataset_id ?? "",
    partner_agent: config.partner_agent ?? "",
    mapping: config.mapping,
    event_names: META_CAPI_EVENT_NAMES,
  });
}

/**
 * POST /api/settings/meta-conversions
 * Body: { waba_id?, dataset_id?, partner_agent?, mapping? }
 */
export async function POST(request: NextRequest) {
  let body: {
    waba_id?: string;
    dataset_id?: string;
    partner_agent?: string;
    mapping?: MetaCapiMapping;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries: { key: string; value: string; updated_at: string }[] = [];
  const now = new Date().toISOString();

  if (body.waba_id !== undefined) {
    entries.push({ key: "meta_capi_waba_id", value: String(body.waba_id).trim(), updated_at: now });
  }
  if (body.dataset_id !== undefined) {
    entries.push({ key: "meta_capi_dataset_id", value: String(body.dataset_id).trim(), updated_at: now });
  }
  if (body.partner_agent !== undefined) {
    entries.push({ key: "meta_capi_partner_agent", value: String(body.partner_agent).trim(), updated_at: now });
  }
  if (body.mapping !== undefined) {
    entries.push({
      key: "meta_capi_mapping",
      value: JSON.stringify(body.mapping),
      updated_at: now,
    });
  }

  for (const row of entries) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: row.key, value: row.value, updated_at: row.updated_at }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
