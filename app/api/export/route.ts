import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/export?format=tsv|csv&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Exporta leads com atribuição (campanha, ad set, anúncio) em TSV ou CSV.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "tsv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (format !== "tsv" && format !== "csv") {
    return NextResponse.json({ error: "format must be tsv or csv" }, { status: 400 });
  }

  const sep = format === "csv" ? "," : "\t";
  const escape = (v: string | null | undefined) => {
    const s = String(v ?? "");
    if (format === "csv" && (s.includes(",") || s.includes('"') || s.includes("\n"))) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  let query = supabase
    .from("leads")
    .select("conversation_id, contact_name, contact_phone, campaign_name, adset_name, ad_name, source_id, ctwa_clid, headline, status, created_at, won_at")
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "conversation_id",
    "contact_name",
    "contact_phone",
    "campaign_name",
    "adset_name",
    "ad_name",
    "source_id",
    "ctwa_clid",
    "headline",
    "status",
    "created_at",
    "won_at",
  ];
  const lines = [headers.join(sep)];
  for (const row of rows ?? []) {
    lines.push(
      headers.map((h) => escape((row as Record<string, unknown>)[h] as string)).join(sep)
    );
  }

  const body = lines.join("\n");
  const contentType = format === "csv" ? "text/csv" : "text/tab-separated-values";
  const filename = `leads-${from ?? "all"}-${to ?? "all"}.${format}`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
