/**
 * Identifica o tenant usado para testes internos (painel de validacao de API do Octadesk).
 * - slug exato "sandbox" (case-insensitive), ou
 * - nome exato "Sandbox", ou nome que comece com "Sandbox " / "Sandbox-" (ex.: "Sandbox EMR").
 */
export function isSandboxPartnerTenant(name: string, slug?: string | null): boolean {
  const s = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (s === "sandbox") return true;
  const n = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (n === "sandbox") return true;
  if (n.startsWith("sandbox ") || n.startsWith("sandbox-")) return true;
  return false;
}
