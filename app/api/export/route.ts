import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

function isYyyyMmDd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * GET /api/export?format=tsv|csv&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Exporta leads com atribuição (campanha, ad set, anúncio) em TSV ou CSV.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`export:${user.id}:${ip}`, 60, 10 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "tsv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (format !== "tsv" && format !== "csv") {
    return NextResponse.json({ error: "format must be tsv or csv" }, { status: 400 });
  }
  if (from && !isYyyyMmDd(from)) {
    return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  if (to && !isYyyyMmDd(to)) {
    return NextResponse.json({ error: "to must be YYYY-MM-DD" }, { status: 400 });
  }

  const sep = format === "csv" ? "," : "\t";
  const escape = (v: string | null | undefined) => {
    const s = String(v ?? "");
    if (format === "csv" && (s.includes(",") || s.includes('"') || s.includes("\n"))) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  let query = supabaseUser
    .from("leads")
    .select("conversation_id, contact_name, contact_phone, campaign_name, adset_name, ad_name, source_id, ctwa_clid, headline, status, created_at, won_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: rows, error } = await query;

  if (error) {
    logApiError("export", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
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
