/**
 * GET Graph API: /{WABA_ID}/dataset — dataset associado à WABA (doc Meta).
 * Uso:
 *   PARTNER_ID=<uuid_emr> WABA_ID=<id> pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-get-dataset.ts
 */
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

const GRAPH = "https://graph.facebook.com/v21.0";

async function main() {
  loadEnvLocal();
  const partnerId = (process.env.PARTNER_ID ?? "").trim();
  const wabaId = (process.env.WABA_ID ?? "887799303731447").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório (tenant com token Meta).");

  const { getMetaAccessToken } = await import("@/lib/get-meta-token");
  const token = await getMetaAccessToken(partnerId);
  if (!token) throw new Error("Token Meta ausente para este partner.");

  const url = `${GRAPH}/${encodeURIComponent(wabaId)}/dataset?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    /* keep text */
  }

  console.log(
    JSON.stringify(
      {
        httpStatus: res.status,
        wabaId,
        partnerId,
        response: body,
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
