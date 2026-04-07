/**
 * Parse de payload no formato OctaDesk (ticket/chat com integração WhatsApp/CTWA).
 * Referência: CONTEXT-CTWA-EMR.md – customFields id "octabsp", referral em messages[0].
 */

import {
  DEFAULT_DESK_SQL_TAG_MARKERS,
  normalizeMarkerForMatch,
} from "@/lib/desk-sql-tag-markers";
import { unwrapOctadeskChatDetail } from "@/lib/integrations/octadesk-probe";

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
  /** True se o JSON do Octadesk trouxer tags/campos que o negócio trata como SQL. */
  hasSqlOpportunityTag: boolean;
};

/** Needles ja em `normalizeMarkerForMatch` para comparar com haystack normalizado. */
const DEFAULT_NORMALIZED_SQL_MARKERS = DEFAULT_DESK_SQL_TAG_MARKERS.map((m) =>
  normalizeMarkerForMatch(m)
);

const TAG_CONTAINER_KEYS = [
  "tags",
  "labels",
  "tagNames",
  "categories",
  "ticketTags",
  "conversationTags",
  "tagList",
] as const;

function normalizeTagMatchText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function stringMatchesSqlTagMarker(
  normalizedHaystack: string,
  normalizedNeedles: readonly string[]
): boolean {
  return normalizedNeedles.some((needle) => needle && normalizedHaystack.includes(needle));
}

/** Uma string de tag (ex. campo raiz `tags`) bate com algum marcador SQL ja normalizado? */
export function deskTagTextMatchesSqlMarkers(
  tagText: string,
  sqlTagMarkersNormalized: readonly string[]
): boolean {
  const normalizedHaystack = normalizeTagMatchText(tagText);
  return stringMatchesSqlTagMarker(normalizedHaystack, sqlTagMarkersNormalized);
}

function pushIfNonEmptyString(out: string[], v: unknown): void {
  if (typeof v === "string" && v.trim()) out.push(v);
}

function collectFromTagLikeValue(v: unknown, out: string[], depth: number): void {
  if (depth > 6 || v == null) return;
  if (typeof v === "string") {
    pushIfNonEmptyString(out, v);
    return;
  }
  if (!Array.isArray(v)) return;
  for (const el of v) {
    if (typeof el === "string") pushIfNonEmptyString(out, el);
    else if (el && typeof el === "object") {
      const o = el as Record<string, unknown>;
      for (const k of ["name", "label", "title", "text", "value", "tag"]) {
        pushIfNonEmptyString(out, o[k]);
      }
    }
  }
}

function collectTagLikeStringsFromObject(obj: Record<string, unknown>, out: string[], depth: number): void {
  if (depth > 5) return;
  for (const key of TAG_CONTAINER_KEYS) {
    if (!(key in obj)) continue;
    collectFromTagLikeValue(obj[key], out, depth + 1);
  }
}

function collectCustomFieldStringsForSqlScan(item: Record<string, unknown>, out: string[]): void {
  const customFields = item.customFields;
  if (!Array.isArray(customFields)) return;
  for (const cf of customFields) {
    if (!cf || typeof cf !== "object") continue;
    const c = cf as Record<string, unknown>;
    for (const k of ["name", "label", "title"]) {
      pushIfNonEmptyString(out, c[k]);
    }
    const val = c.value;
    if (typeof val === "string" && val.length > 0 && val.length <= 160) {
      out.push(val);
    }
  }
}

const STATUS_LIKE_ROOT_KEYS = [
  "status",
  "chatStatus",
  "phase",
  "subStatus",
  "ticketStatus",
  "conversationStatus",
  "currentStatus",
  "department",
  "queue",
] as const;

/** Raiz do objeto: chaves cujo nome sugere tag/label/categoria. */
function collectRootKeysMatchingTagPattern(item: Record<string, unknown>, out: string[]): void {
  for (const [key, val] of Object.entries(item)) {
    if (!/tag|label|categor|etiqueta|marcador|oportunidade/i.test(key)) continue;
    collectFromTagLikeValue(val, out, 0);
    if (typeof val === "string") pushIfNonEmptyString(out, val);
  }
}

function collectCustomFieldStringsForInventory(item: Record<string, unknown>, out: string[]): void {
  const customFields = item.customFields;
  if (!Array.isArray(customFields)) return;
  for (const cf of customFields) {
    if (!cf || typeof cf !== "object") continue;
    const c = cf as Record<string, unknown>;
    for (const k of ["name", "label", "title", "description"]) {
      pushIfNonEmptyString(out, c[k]);
    }
    const val = c.value;
    if (typeof val === "string" && val.trim() && val.length <= 500) {
      out.push(val.trim());
    }
  }
}

/**
 * Coleta textos candidatos a tag/estágio para inventário (diagnóstico).
 * Mais amplo que o scan de SQL: valores de custom field maiores, status na raiz, chaves com nome "tag"/"label"/etc.
 */
export function collectOctadeskTagInventoryStrings(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  collectTagLikeStringsFromObject(item, out, 0);
  collectCustomFieldStringsForInventory(item, out);
  for (const k of STATUS_LIKE_ROOT_KEYS) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  collectRootKeysMatchingTagPattern(item, out);
  return out;
}

/**
 * Indica se o objeto chat/ticket Octadesk contém texto que bate com algum marcador SQL.
 * @param sqlTagMarkersNormalized — retorno de `normalizedMarkersForScan` (lib/desk-sql-tag-markers).
 */
export function octadeskItemIndicatesSqlOpportunityTag(
  item: Record<string, unknown>,
  sqlTagMarkersNormalized: readonly string[]
): boolean {
  const candidates: string[] = [];
  collectTagLikeStringsFromObject(item, candidates, 0);
  collectCustomFieldStringsForSqlScan(item, candidates);
  return candidates.some((s) =>
    stringMatchesSqlTagMarker(normalizeTagMatchText(s), sqlTagMarkersNormalized)
  );
}

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

export type ParseOctaDeskItemOptions = {
  /** Needles normalizados; omitir = defaults em lib/desk-sql-tag-markers. */
  sqlTagMarkersNormalized?: readonly string[];
};

/**
 * Extrai um lead (conversa iniciada por CTWA) de um item no formato OctaDesk.
 * Retorna null se não houver referral ou se faltar campo obrigatório (source_id, ctwa_clid).
 */
export function parseOctaDeskItem(
  item: Record<string, unknown>,
  options?: ParseOctaDeskItemOptions
): ParsedLeadFromOctaDesk | null {
  const root = unwrapOctadeskChatDetail(item) ?? item;
  const referral = getReferral(root);
  if (!referral || !referral.source_id?.trim() || !referral.ctwa_clid?.trim()) return null;

  const needles = options?.sqlTagMarkersNormalized ?? DEFAULT_NORMALIZED_SQL_MARKERS;

  const contact = (root.contact as Record<string, unknown>) ?? {};
  const contactName = (contact.name as string) ?? null;
  const contactPhone = getContactPhone(root);
  const conversationId = String(root.id ?? "");
  const createdAt = root.createdAt != null ? String(root.createdAt) : null;
  const hasSqlOpportunityTag = octadeskItemIndicatesSqlOpportunityTag(root, needles);

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
    hasSqlOpportunityTag,
  };
}

/**
 * Aceita body do webhook: um único objeto ou um array de objetos (OctaDesk).
 */
export function parseOctaDeskPayload(
  body: unknown,
  sqlTagMarkersNormalized?: readonly string[]
): ParsedLeadFromOctaDesk | null {
  if (body == null || typeof body !== "object") return null;
  const item = Array.isArray(body) ? body[0] : body;
  if (item == null || typeof item !== "object") return null;
  return parseOctaDeskItem(item as Record<string, unknown>, {
    sqlTagMarkersNormalized: sqlTagMarkersNormalized ?? DEFAULT_NORMALIZED_SQL_MARKERS,
  });
}
