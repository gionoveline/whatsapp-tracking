import { NextRequest, NextResponse } from "next/server";
import { parseOctaDeskPayload } from "@/lib/octadesk";
import { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } from "@/lib/desk-sql-tag-markers";
import { isUuidLike, requireWebhookSecretForPartner } from "@/lib/webhook-auth";
import { resolveWebhookPartner } from "@/lib/server-auth";
import { getClientIp, isRateLimited } from "@/lib/request-security";
import { persistParsedOctaDeskLead } from "@/lib/ingest-octadesk-lead";

/**
 * POST /api/webhooks/lead — Conversa iniciada (CTWA).
 * Campos obrigatórios no payload: createdAt, telefone do lead, id do anúncio (source_id), ctwa_clid, headline, source_url.
 */
export async function POST(request: NextRequest) {
  const partnerIdHeader = request.headers.get("x-partner-id")?.trim();
  if (!partnerIdHeader || !isUuidLike(partnerIdHeader)) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`webhook:lead:${partnerIdHeader}:${ip}`, 200, 15 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!(await requireWebhookSecretForPartner(request, partnerIdHeader))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const partnerId = await resolveWebhookPartner(request);
  if (!partnerId) {
    return NextResponse.json({ error: "x-partner-id is required" }, { status: 400 });
  }

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId);
  const sqlMarkersNorm = normalizedMarkersForScan(sqlMarkers);

  const parsed = parseOctaDeskPayload(body, sqlMarkersNorm);
  if (!parsed) {
    return NextResponse.json(
      { error: "Payload must include CTWA referral with source_id and ctwa_clid" },
      { status: 400 }
    );
  }
  if (!parsed.contactPhone?.trim()) {
    return NextResponse.json(
      { error: "contact_phone is required (conversation must be tied to a phone number)" },
      { status: 400 }
    );
  }
  if (!parsed.headline?.trim() || !parsed.sourceUrl?.trim()) {
    return NextResponse.json(
      { error: "Referral must include headline and source_url (ad fields required)" },
      { status: 400 }
    );
  }
  if (!parsed.createdAt?.trim()) {
    return NextResponse.json({ error: "createdAt is required and must be a valid ISO datetime" }, { status: 400 });
  }

  const persisted = await persistParsedOctaDeskLead(partnerId, parsed);
  if (!persisted.ok) {
    const status = persisted.error.includes("createdAt") ? 400 : 400;
    return NextResponse.json({ error: persisted.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    lead: {
      id: persisted.leadId,
      conversation_id: persisted.conversationId,
      status: persisted.status,
    },
  });
}
