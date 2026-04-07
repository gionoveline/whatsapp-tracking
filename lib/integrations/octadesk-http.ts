import { normalizeOctadeskBaseUrl } from "@/lib/integrations/octadesk-client";

export type OctadeskApiGetResult = {
  ok: boolean;
  status: number;
  parsed: unknown;
};

/**
 * GET na API Octadesk (path com query, ex. `/chat?page=1&limit=10`).
 */
export async function octadeskApiGet(
  baseUrl: string,
  apiToken: string,
  pathAndQuery: string,
  timeoutMs: number
): Promise<OctadeskApiGetResult> {
  const bu = normalizeOctadeskBaseUrl(baseUrl);
  const token = apiToken.trim();
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${bu}${path}`, {
      method: "GET",
      headers: { "X-API-KEY": token, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* ignore */
    }
    return { ok: res.ok, status: res.status, parsed };
  } finally {
    clearTimeout(t);
  }
}
