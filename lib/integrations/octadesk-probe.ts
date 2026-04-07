/**
 * Helpers para inspecionar respostas da API Octadesk sem vazar PII.
 */

/**
 * Algumas respostas GET /chat/{id} vêm com o ticket em `data`, `item`, etc.
 * O restante do código assume o objeto do chat na raiz (id, tags, customFields).
 */
export function unwrapOctadeskChatDetail(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;

  const looksLikeChat = (o: Record<string, unknown>): boolean =>
    o.id != null ||
    Array.isArray(o.customFields) ||
    o.contact != null ||
    o.tags != null;

  if (looksLikeChat(root)) return root;

  for (const k of ["data", "item", "chat", "ticket", "result", "content"] as const) {
    const inner = root[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const o = inner as Record<string, unknown>;
      if (looksLikeChat(o)) return o;
    }
  }
  return root;
}

export function extractOctadeskTicketList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const keys = ["data", "tickets", "items", "results", "content", "records", "rows"] as const;
  for (const k of keys) {
    const v = (json as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v;
  }
  const data = (json as Record<string, unknown>).data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function ticketHasOctabspReferral(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const customFields = (item as { customFields?: unknown }).customFields;
  if (!Array.isArray(customFields)) return false;
  const octabsp = customFields.find((cf: unknown) => (cf as { id?: string }).id === "octabsp") as
    | Record<string, unknown>
    | undefined;
  if (!octabsp?.integrator) return false;
  const integrator = octabsp.integrator as Record<string, unknown>;
  const integratorCustom = integrator.customFields as Record<string, unknown> | undefined;
  const arr = integratorCustom?.messages as unknown[] | undefined;
  if (!Array.isArray(arr) || !arr[0] || typeof arr[0] !== "object") return false;
  const referral = (arr[0] as Record<string, unknown>).referral as Record<string, unknown> | undefined;
  if (!referral) return false;
  return Boolean(
    typeof referral.source_id === "string" &&
      referral.source_id.trim() &&
      typeof referral.ctwa_clid === "string" &&
      referral.ctwa_clid.trim()
  );
}

export function safeTopKeys(item: unknown, max = 25): string[] {
  if (!item || typeof item !== "object") return [];
  return Object.keys(item as object)
    .sort()
    .slice(0, max);
}
