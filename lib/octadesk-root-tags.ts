/**
 * Extrai strings do campo raiz `tags` do JSON de chat/ticket Octadesk (diagnostico Sandbox).
 */

function pushIfString(out: string[], v: unknown): void {
  if (typeof v === "string" && v.trim()) out.push(v.trim());
}

export function collectStringsFromRootTagsField(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const tags = item.tags;
  if (tags == null) return out;
  if (typeof tags === "string") {
    pushIfString(out, tags);
    return out;
  }
  if (!Array.isArray(tags)) return out;
  for (const el of tags) {
    if (typeof el === "string") pushIfString(out, el);
    else if (el && typeof el === "object") {
      const o = el as Record<string, unknown>;
      for (const k of ["name", "label", "title", "text", "value", "tag"]) {
        pushIfString(out, o[k]);
      }
    }
  }
  return out;
}
