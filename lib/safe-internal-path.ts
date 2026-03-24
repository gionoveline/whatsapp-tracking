/**
 * Evita open redirect em ?next= — só permite caminhos relativos internos.
 */
export function getSafeInternalPath(
  next: string | null | undefined,
  fallback: string
): string {
  if (!next || typeof next !== "string") return fallback;
  const u = next.trim();
  if (!u.startsWith("/") || u.startsWith("//")) return fallback;
  if (u.includes("..")) return fallback;
  const pathOnly = u.split("?")[0]?.split("#")[0] ?? "";
  if (!pathOnly) return fallback;
  if (pathOnly === "/login" || pathOnly.startsWith("/auth/")) return fallback;
  return pathOnly;
}
