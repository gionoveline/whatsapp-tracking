/**
 * Parse de payload no formato OctaDesk (ticket/chat com integração WhatsApp/CTWA).
 * Referência: CONTEXT-CTWA-EMR.md – customFields id "octabsp", referral em messages[0].
 */

export type OctaDeskReferral = {
  source_id: string | null;
  ctwa_clid: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  image_url: string | null;
  source_type?: string;
};

export type ParsedLeadFromOctaDesk = {
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  sourceId: string | null;
  ctwaClid: string | null;
  headline: string | null;
  adBody: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  createdAt: string | null;
};

function getReferral(item: Record<string, unknown>): OctaDeskReferral | null {
  const customFields = (item.customFields as unknown[] | undefined) ?? [];
  const octabsp = customFields.find((cf: unknown) => (cf as { id?: string }).id === "octabsp") as Record<string, unknown> | undefined;
  if (!octabsp?.integrator) return null;
  const integrator = octabsp.integrator as Record<string, unknown>;
  const messages = (integrator.customFields as Record<string, unknown>)?.messages as Record<string, unknown>[] | undefined;
  const first = messages?.[0] as Record<string, unknown> | undefined;
  const referral = first?.referral as Record<string, unknown> | undefined;
  if (!referral) return null;
  return {
    source_id: (referral.source_id as string) ?? null,
    ctwa_clid: (referral.ctwa_clid as string) ?? null,
    source_url: (referral.source_url as string) ?? null,
    headline: (referral.headline as string) ?? null,
    body: (referral.body as string) ?? null,
    image_url: (referral.image_url as string) ?? null,
    source_type: referral.source_type as string | undefined,
  };
}

function getContactPhone(item: Record<string, unknown>): string | null {
  const customFields = (item.customFields as unknown[] | undefined) ?? [];
  const octabsp = customFields.find((cf: unknown) => (cf as { id?: string }).id === "octabsp") as Record<string, unknown> | undefined;
  const from = (octabsp?.integrator as Record<string, unknown>)?.from as Record<string, unknown> | undefined;
  const number = from?.number as string | undefined;
  return number ?? null;
}

/**
 * Extrai um lead (conversa iniciada por CTWA) de um item no formato OctaDesk.
 * Retorna null se não houver referral ou se faltar campo obrigatório (source_id, ctwa_clid).
 */
export function parseOctaDeskItem(item: Record<string, unknown>): ParsedLeadFromOctaDesk | null {
  const referral = getReferral(item);
  if (!referral || !referral.source_id?.trim() || !referral.ctwa_clid?.trim()) return null;

  const contact = (item.contact as Record<string, unknown>) ?? {};
  const contactName = (contact.name as string) ?? null;
  const contactPhone = getContactPhone(item);
  const conversationId = String(item.id ?? "");
  const createdAt = item.createdAt != null ? String(item.createdAt) : null;

  return {
    conversationId,
    contactName,
    contactPhone,
    sourceId: referral.source_id,
    ctwaClid: referral.ctwa_clid,
    headline: referral.headline,
    adBody: referral.body,
    imageUrl: referral.image_url,
    sourceUrl: referral.source_url,
    createdAt,
  };
}

/**
 * Aceita body do webhook: um único objeto ou um array de objetos (OctaDesk).
 */
export function parseOctaDeskPayload(body: unknown): ParsedLeadFromOctaDesk | null {
  if (body == null || typeof body !== "object") return null;
  const item = Array.isArray(body) ? body[0] : body;
  if (item == null || typeof item !== "object") return null;
  return parseOctaDeskItem(item as Record<string, unknown>);
}
