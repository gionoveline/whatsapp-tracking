/**
 * Lê credenciais Octadesk de app_settings (Supabase), prefere partner com nome "Sandbox",
 * analisa modulo CHAT: lista + (opcional) detalhe de N conversas para sinais CTWA/referral.
 *
 * Uso (na raiz do projeto):
 *   node --env-file=.env.local scripts/octadesk-sandbox-probe.cjs
 *
 * Opcional: OCTADESK_CHAT_SAMPLE_LIMIT=50 (padrao 50, max 100)
 *            OCTADESK_FETCH_DETAILS=1 (padrao) busca GET /chat/{id} para cada item da lista
 *            OCTADESK_FETCH_DETAILS=0 so lista + 1o chat em profundidade (modo rapido)
 *
 * Não imprime token nem dados sensíveis completos.
 */

const { createClient } = require("@supabase/supabase-js");
const { createDecipheriv, createHash } = require("node:crypto");

const ENC_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const raw = process.env.APP_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  try {
    const asBase64 = Buffer.from(raw, "base64");
    if (asBase64.length === 32) return asBase64;
  } catch {
    /* ignore */
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

function decryptAppSettingValue(value) {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const key = getEncryptionKey();
  if (!key) return null;
  const payload = value.slice(ENC_PREFIX.length);
  let packed;
  try {
    packed = Buffer.from(payload, "base64");
  } catch {
    return null;
  }
  if (packed.length <= IV_LENGTH + TAG_LENGTH) return null;
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

function normalizeBaseUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "");
}

function hasOctabspReferral(item) {
  if (!item || typeof item !== "object") return false;
  const customFields = item.customFields;
  if (!Array.isArray(customFields)) return false;
  const octabsp = customFields.find((cf) => cf && cf.id === "octabsp");
  if (!octabsp || !octabsp.integrator) return false;
  const messages = octabsp.integrator?.customFields?.messages;
  if (!Array.isArray(messages) || !messages[0]?.referral) return false;
  const r = messages[0].referral;
  return Boolean(r.source_id && r.ctwa_clid);
}

/**
 * OpenAPI documenta array direto; algumas instâncias podem envelopar (items, data, etc.).
 */
function extractTicketList(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const keys = ["data", "tickets", "items", "results", "content", "records", "rows"];
  for (const k of keys) {
    const v = json[k];
    if (Array.isArray(v)) return v;
  }
  if (json.data && typeof json.data === "object") {
    for (const k of keys) {
      const v = json.data[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: rows, error } = await supabase
    .from("app_settings")
    .select("partner_id,key,value")
    .in("key", ["desk.provider.octadesk.baseUrl", "desk.provider.octadesk.apiToken"]);

  if (error) {
    console.error("Erro ao ler app_settings:", error.message);
    process.exit(1);
  }

  const byPartner = new Map();
  for (const row of rows ?? []) {
    if (!byPartner.has(row.partner_id)) byPartner.set(row.partner_id, {});
    const o = byPartner.get(row.partner_id);
    if (row.key === "desk.provider.octadesk.baseUrl") o.baseUrl = row.value;
    if (row.key === "desk.provider.octadesk.apiToken") o.apiTokenEnc = row.value;
  }

  const { data: partners } = await supabase.from("partners").select("id,name,slug");
  const partnerById = new Map((partners ?? []).map((p) => [p.id, p]));

  const candidates = [...byPartner.entries()].filter(([, cfg]) => cfg.baseUrl && cfg.apiTokenEnc);

  if (candidates.length === 0) {
    console.log("Nenhum tenant com desk.provider.octadesk (baseUrl + apiToken) em app_settings.");
    process.exit(0);
  }

  let chosen = candidates.find(([pid]) => /sandbox/i.test(partnerById.get(pid)?.name ?? ""));
  if (!chosen) chosen = candidates[0];

  const [partnerId, cfg] = chosen;
  const partnerName = partnerById.get(partnerId)?.name ?? "(sem nome)";
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  let apiToken = decryptAppSettingValue(cfg.apiTokenEnc);
  if (apiToken == null && cfg.apiTokenEnc) {
    console.error("Nao foi possivel descriptografar o token (verifique APP_SETTINGS_ENCRYPTION_KEY).");
    process.exit(1);
  }
  if (!apiToken) {
    console.error("Token vazio em app_settings.");
    process.exit(1);
  }

  console.log("Partner escolhido:", partnerName);
  console.log("Partner ID:", partnerId);
  console.log("Base URL:", baseUrl);
  console.log("---");

  async function octaGet(pathWithQuery, timeoutMs = 20000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${pathWithQuery}`, {
        method: "GET",
        headers: { "X-API-KEY": apiToken, Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* ignore */
      }
      return { res, text, parsed };
    } finally {
      clearTimeout(t);
    }
  }

  function leadSignalsInJson(value) {
    const s = JSON.stringify(value);
    return {
      hasReferralKey: /"referral"\s*:/i.test(s) || /referral/i.test(s),
      hasCtwa: /ctwa_clid/i.test(s),
      hasOctabsp: /octabsp/i.test(s),
      hasSourceId: /source_id/i.test(s),
    };
  }

  function mergeSignalAgg(agg, sig) {
    if (sig.hasReferralKey) agg.referral++;
    if (sig.hasCtwa) agg.ctwa++;
    if (sig.hasOctabsp) agg.octabsp++;
    if (sig.hasSourceId) agg.sourceId++;
  }

  const chatLimit = Math.min(100, Math.max(1, parseInt(process.env.OCTADESK_CHAT_SAMPLE_LIMIT || "50", 10)));
  const fetchDetails = process.env.OCTADESK_FETCH_DETAILS !== "0";

  console.log("\n=== Modulo CHAT (amostra N=" + chatLimit + ", detalhes=" + (fetchDetails ? "sim" : "nao") + ") ===\n");

  let chatRes;
  try {
    chatRes = await octaGet(`/chat?page=1&limit=${chatLimit}`);
  } catch (e) {
    console.error("Falha de rede GET /chat:", e.message);
    process.exit(1);
  }

  console.log(`GET /chat?page=1&limit=${chatLimit} → HTTP`, chatRes.res.status);
  if (!chatRes.parsed) {
    console.log("Resposta nao-JSON (200 chars):", chatRes.text.slice(0, 200));
    process.exit(chatRes.res.ok ? 0 : 1);
  }

  const chats = extractTicketList(chatRes.parsed);
  console.log("Conversas retornadas nesta pagina:", chats.length);

  if (chats.length === 0) {
    console.log("Nenhuma conversa retornada pela API /chat.");
    process.exit(0);
  }

  const listAgg = { referral: 0, ctwa: 0, octabsp: 0, sourceId: 0, webhookShape: 0 };
  for (const item of chats) {
    if (!item || typeof item !== "object") continue;
    mergeSignalAgg(listAgg, leadSignalsInJson(item));
    if (hasOctabspReferral(item)) listAgg.webhookShape++;
  }
  console.log("\nAgregado na LISTA (cada conversa, ate " + chats.length + "):");
  console.log("  com texto referral:", listAgg.referral);
  console.log("  com ctwa_clid:", listAgg.ctwa);
  console.log("  com octabsp:", listAgg.octabsp);
  console.log("  com source_id:", listAgg.sourceId);
  console.log("  formato webhook completo (parser):", listAgg.webhookShape);

  const c0 = chats[0];
  const firstId = c0 && typeof c0 === "object" ? c0.id : null;
  if (firstId) {
    console.log("\nPrimeiro id (amostra):", firstId, "channel=", (c0 && c0.channel) || "(n/a)");
  }

  let detailAgg = {
    ok: 0,
    httpFail: 0,
    referral: 0,
    ctwa: 0,
    octabsp: 0,
    sourceId: 0,
    webhookShape: 0,
    idsCtwa: [],
    idsWebhook: [],
  };

  if (fetchDetails) {
    console.log("\nBuscando GET /chat/{id} para cada item (" + chats.length + " chamadas, pausa ~120ms)...");
    for (let i = 0; i < chats.length; i++) {
      const item = chats[i];
      const id = item && typeof item === "object" ? item.id : null;
      if (!id) continue;
      let d;
      try {
        d = await octaGet(`/chat/${encodeURIComponent(String(id))}`, 18000);
      } catch (e) {
        detailAgg.httpFail++;
        continue;
      }
      if (!d.res.ok) {
        detailAgg.httpFail++;
        continue;
      }
      detailAgg.ok++;
      const sig = leadSignalsInJson(d.parsed);
      mergeSignalAgg(detailAgg, sig);
      if (hasOctabspReferral(d.parsed)) {
        detailAgg.webhookShape++;
        if (detailAgg.idsWebhook.length < 8) detailAgg.idsWebhook.push(String(id));
      }
      if (sig.hasCtwa && detailAgg.idsCtwa.length < 8) detailAgg.idsCtwa.push(String(id));

      await new Promise((r) => setTimeout(r, 120));
    }

    console.log("\nAgregado nos DETALHES (" + detailAgg.ok + " OK, " + detailAgg.httpFail + " falha HTTP):");
    console.log("  com texto referral:", detailAgg.referral);
    console.log("  com ctwa_clid:", detailAgg.ctwa);
    console.log("  com octabsp:", detailAgg.octabsp);
    console.log("  com source_id:", detailAgg.sourceId);
    console.log("  formato webhook completo (parser):", detailAgg.webhookShape);
    if (detailAgg.idsCtwa.length) console.log("  ids (ate 8) com ctwa_clid no JSON:", detailAgg.idsCtwa.join(", "));
    if (detailAgg.idsWebhook.length) console.log("  ids (ate 8) parser webhook SIM:", detailAgg.idsWebhook.join(", "));
  }

  const chatId = firstId;
  if (!chatId) {
    process.exit(0);
  }

  const idEnc = encodeURIComponent(String(chatId));
  let detail = await octaGet(`/chat/${idEnc}`);

  const msgQueries = [
    `/chat/${idEnc}/messages?page=1&limit=30&property=time&direction=asc`,
    `/chat/${idEnc}/messages?page=1&limit=30`,
  ];

  let msgs = null;
  let lastText = "";
  for (const q of msgQueries) {
    let m;
    try {
      m = await octaGet(q);
    } catch (e) {
      console.error("GET messages erro:", e.message);
      break;
    }
    lastText = m.text;
    if (m.res.ok && Array.isArray(m.parsed)) {
      msgs = m.parsed;
      break;
    }
    if (m.res.ok && m.parsed) {
      msgs = extractTicketList(m.parsed);
      if (msgs.length > 0) break;
    }
  }

  console.log("\n--- Profundidade so no 1o chat (mensagens) ---");
  console.log("GET /chat/{id} (1o) → HTTP", detail.res.status);
  if (detail.parsed && typeof detail.parsed === "object") {
    console.log("Sinais no detalhe (1o):", leadSignalsInJson(detail.parsed));
    console.log("Parser webhook (1o):", hasOctabspReferral(detail.parsed) ? "SIM" : "NAO");
  }

  if (msgs && Array.isArray(msgs)) {
    console.log("Mensagens (1o chat):", msgs.length, "| sinais:", leadSignalsInJson(msgs));
  } else {
    console.log("Mensagens (1o chat): nao obtidas.", lastText.slice(0, 120));
  }

  console.log("\n--- Conclusao ---");
  const anyCtwa = fetchDetails ? detailAgg.ctwa > 0 : listAgg.ctwa > 0;
  const anyWebhook = fetchDetails ? detailAgg.webhookShape > 0 : listAgg.webhookShape > 0;
  if (anyWebhook) {
    console.log("Encontrado pelo menos 1 chat onde o detalhe bate com o parser do webhook.");
  } else if (anyCtwa) {
    console.log("Apareceu ctwa_clid em algum JSON de detalhe; revisar estrutura para mapear ao lead.");
  } else if ((fetchDetails ? detailAgg.octabsp : listAgg.octabsp) > 0) {
    console.log("Ha mencao a octabsp em alguns JSON, mas sem ctwa_clid/parser completo na amostra.");
  } else {
    console.log("Na amostra de " + chats.length + " conversas, nenhum sinal forte de CTWA no padrao do webhook.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
