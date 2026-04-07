/**
 * Reprocessa os status SQL (lead/sql) de um parceiro com base nos marcadores SQL atuais.
 *
 * - Preserva leads com status "venda".
 * - Reclassifica apenas entre "lead" e "sql".
 * - Faz leitura em lotes no banco e busca detalhe no Octadesk por conversation_id.
 * - Suporta dry-run para validar impacto sem persistir.
 *
 * Uso (dry-run):
 *   PARTNER_ID=<uuid> DRY_RUN=1 pnpm dlx tsx --tsconfig tsconfig.json scripts/reprocess-sql-markers.ts
 *
 * Uso (aplicar):
 *   PARTNER_ID=<uuid> pnpm dlx tsx --tsconfig tsconfig.json scripts/reprocess-sql-markers.ts
 *
 * Opcional:
 *   BATCH_SIZE=200           (default: 100)
 *   REQUEST_DELAY_MS=80      (default: 80)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type LeadStatus = "lead" | "sql" | "venda";

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

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveNextStatus(existing: LeadStatus, hasSqlOpportunityTag: boolean): LeadStatus {
  if (existing === "venda") return "venda";
  return hasSqlOpportunityTag ? "sql" : "lead";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvLocal();

  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  if (!partnerId) {
    throw new Error("PARTNER_ID e obrigatorio.");
  }

  const dryRun = ["1", "true", "yes"].includes((process.env.DRY_RUN ?? "").toLowerCase());
  const batchSize = parsePositiveInt(process.env.BATCH_SIZE, 100);
  const requestDelayMs = parsePositiveInt(process.env.REQUEST_DELAY_MS, 80);

  const { createClient } = await import("@supabase/supabase-js");
  const { decryptAppSettingValue } = await import("@/lib/app-settings-crypto");
  const { getDeskProviderCredentialKeys } = await import("@/lib/integrations/providers");
  const { normalizeOctadeskBaseUrl } = await import("@/lib/integrations/octadesk-client");
  const { octadeskApiGet } = await import("@/lib/integrations/octadesk-http");
  const { parseOctaDeskItem } = await import("@/lib/octadesk");
  const { getDeskSqlTagMarkersForPartner, normalizedMarkersForScan } = await import("@/lib/desk-sql-tag-markers");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const keys = getDeskProviderCredentialKeys("octadesk");
  const { data: settings, error: sErr } = await supabase
    .from("app_settings")
    .select("key,value")
    .eq("partner_id", partnerId)
    .in("key", [keys.baseUrl, keys.apiToken]);
  if (sErr) throw new Error(`Erro ao ler credenciais: ${sErr.message}`);

  const baseUrlRaw = settings?.find((r) => r.key === keys.baseUrl)?.value ?? "";
  const tokenEnc = settings?.find((r) => r.key === keys.apiToken)?.value ?? "";
  const baseUrl = normalizeOctadeskBaseUrl(String(baseUrlRaw));
  const apiToken = tokenEnc ? decryptAppSettingValue(String(tokenEnc)) ?? "" : "";
  if (!baseUrl || !apiToken) throw new Error("Credenciais Octadesk ausentes para o partner informado.");

  const sqlMarkers = await getDeskSqlTagMarkersForPartner(partnerId, supabase);
  const sqlMarkersNorm = normalizedMarkersForScan(sqlMarkers);

  const { count: totalLeads, error: cErr } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId);
  if (cErr) throw new Error(`Erro ao contar leads: ${cErr.message}`);

  let scanned = 0;
  let detailOk = 0;
  let detailFail = 0;
  let parseFail = 0;
  let noConversation = 0;
  let wouldChange = 0;
  let changed = 0;
  let unchanged = 0;
  let toLead = 0;
  let toSql = 0;
  let keptVenda = 0;
  let updateFail = 0;

  for (let offset = 0; ; offset += batchSize) {
    const end = offset + batchSize - 1;
    const { data: rows, error: rowsErr } = await supabase
      .from("leads")
      .select("id,conversation_id,status")
      .eq("partner_id", partnerId)
      .order("id", { ascending: true })
      .range(offset, end);

    if (rowsErr) throw new Error(`Erro ao paginar leads: ${rowsErr.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      const currentStatus = String(row.status ?? "") as LeadStatus;
      const convId = String(row.conversation_id ?? "").trim();

      if (currentStatus === "venda") {
        keptVenda += 1;
        continue;
      }

      if (!convId) {
        noConversation += 1;
        continue;
      }

      const detail = await octadeskApiGet(baseUrl, apiToken, `/chat/${encodeURIComponent(convId)}`, 22000);
      if (!detail.ok || !detail.parsed || typeof detail.parsed !== "object") {
        detailFail += 1;
        await sleep(requestDelayMs);
        continue;
      }
      detailOk += 1;

      const parsed = parseOctaDeskItem(detail.parsed as Record<string, unknown>, {
        sqlTagMarkersNormalized: sqlMarkersNorm,
      });
      if (!parsed) {
        parseFail += 1;
        await sleep(requestDelayMs);
        continue;
      }

      const nextStatus = resolveNextStatus(currentStatus, parsed.hasSqlOpportunityTag);
      if (nextStatus === currentStatus) {
        unchanged += 1;
        await sleep(requestDelayMs);
        continue;
      }

      wouldChange += 1;
      if (nextStatus === "lead") toLead += 1;
      if (nextStatus === "sql") toSql += 1;

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("leads")
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("partner_id", partnerId);

        if (upErr) {
          updateFail += 1;
        } else {
          changed += 1;
        }
      }

      await sleep(requestDelayMs);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        partnerId,
        batchSize,
        requestDelayMs,
        totalLeadsInPartner: totalLeads ?? null,
        sqlMarkersConfigured: sqlMarkers,
        processed: {
          scanned,
          detailOk,
          detailFail,
          parseFail,
          noConversation,
          keptVenda,
        },
        reclassification: {
          unchanged,
          wouldChange,
          changed: dryRun ? 0 : changed,
          updateFail: dryRun ? 0 : updateFail,
          toLead,
          toSql,
        },
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

