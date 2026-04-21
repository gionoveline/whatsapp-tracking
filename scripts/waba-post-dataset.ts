/**
 * POST Graph API: /{WABA_ID}/dataset — cria/vincula dataset (doc Meta: parâmetro dataset_name).
 * Uso:
 *   PARTNER_ID=<uuid> DATASET_NAME="Nome do dataset" [WABA_ID=...] pnpm dlx tsx --tsconfig tsconfig.json scripts/waba-post-dataset.ts
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
  const datasetName = (process.env.DATASET_NAME ?? "").trim();
  if (!partnerId) throw new Error("PARTNER_ID obrigatório.");
  if (!datasetName) throw new Error("DATASET_NAME obrigatório (nome do dataset na Meta).");

  const { getMetaAccessToken } = await import("@/lib/get-meta-token");
  const token = await getMetaAccessToken(partnerId);
  if (!token) throw new Error("Token Meta ausente para este partner.");

  const url = `${GRAPH}/${encodeURIComponent(wabaId)}/dataset`;
  const body = new URLSearchParams({
    access_token: token,
    dataset_name: datasetName,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }

  console.log(
    JSON.stringify(
      {
        httpStatus: res.status,
        wabaId,
        partnerId,
        datasetName,
        response: parsed,
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
