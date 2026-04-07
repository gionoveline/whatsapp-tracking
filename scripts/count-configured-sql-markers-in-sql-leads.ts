import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { isSandboxPartnerTenant } = await import("@/lib/sandbox-partner");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { collectOctadeskTagInventoryStrings } = await import("@/lib/octadesk");
  const { normalizeMarkerForMatch } = await import("@/lib/desk-sql-tag-markers");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing supabase envs.");
  const supabase = createClient(url, key);

  const markers = ["Oportunidade atualizada", "Oportunidade criada", "Optou por falar com consultor"] as const;
  const markerNorm = markers.map((label) => ({ label, norm: normalizeMarkerForMatch(label) }));

  const { data: partners, error: pErr } = await supabase.from("partners").select("id,name,slug");
  if (pErr || !partners?.length) throw new Error(pErr?.message ?? "No partners.");
  const sandbox = partners.find((p) => isSandboxPartnerTenant(p.name, p.slug));
  if (!sandbox) throw new Error("Sandbox not found.");

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: sErr } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", sandbox.id)
    .in("key", [keys.baseUrl, keys.apiToken]);
  if (sErr) throw new Error(sErr.message);

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(String(tokenEnc)) ?? "" : "";
  if (!baseUrl || !apiToken) throw new Error("Missing Octadesk credentials.");

  const { data: rows, error: lErr } = await supabase
    .from("leads")
    .select("conversation_id")
    .eq("partner_id", sandbox.id)
    .eq("status", "sql");
  if (lErr) throw new Error(lErr.message);

  const convs = (rows ?? []).map((r) => String(r.conversation_id ?? "").trim()).filter(Boolean);
  const counts = new Map<string, number>(markers.map((m) => [m, 0]));
  let detailsFetched = 0;

  for (const convId of convs) {
    const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${encodeURIComponent(convId)}`, 20000);
    if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") continue;
    detailsFetched += 1;
    const candidates = collectOctadeskTagInventoryStrings(detail.parsed as Record<string, unknown>).map((s) =>
      normalizeMarkerForMatch(s)
    );
    for (const m of markerNorm) {
      if (candidates.some((c) => c.includes(m.norm))) {
        counts.set(m.label, (counts.get(m.label) ?? 0) + 1);
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(
    JSON.stringify(
      {
        sandboxId: sandbox.id,
        dbLeadsStatusSql: convs.length,
        detailsFetched,
        markers: Object.fromEntries(counts),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

