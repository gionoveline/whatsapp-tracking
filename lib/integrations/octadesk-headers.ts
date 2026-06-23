export function sanitizeOctadeskAgentEmail(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s || s.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

/** Headers exigidos pela API Octadesk (Chat exige `octa-agent-email` desde ~jun/2026). */
export function buildOctadeskApiHeaders(apiToken: string, agentEmail?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "X-API-KEY": apiToken.trim(),
    Accept: "application/json",
  };
  const email = sanitizeOctadeskAgentEmail(agentEmail);
  if (email) headers["octa-agent-email"] = email;
  return headers;
}
