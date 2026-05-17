"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRequiredPartner } from "@/lib/use-required-partner";
import { getPublicSiteUrlForClient } from "@/lib/public-site-url";
import { authFetch } from "@/lib/client-auth";
import { EmrCampaignLinksCard } from "@/components/google-lp/EmrCampaignLinksCard";
import {
  DEFAULT_GOOGLE_LP_TRACKING,
  type GoogleLpTrackingStored,
  jsonForInlineScriptAssignment,
  sanitizeWhatsAppPhone,
} from "@/lib/google-lp-tracking-settings";

/** Padrão do produto para nomes de cookie (first-touch). Igual ao default do script em `public/tracking/wt-google-lp.js`. */
const COOKIE_PREFIX = "wt_lp";

function buildSnippetBlock(scriptOrigin: string, partnerId: string, config: GoogleLpTrackingStored): string {
  const preset: Record<string, unknown> = {
    protocolMessageTemplate: config.protocolMessageTemplate,
    enhanceWhatsapp: true,
  };
  const assignment = `window.__WT_GOOGLE_LP=${jsonForInlineScriptAssignment(preset)};`;
  const configScript = `<script>${assignment}<\/script>`;
  const qs = new URLSearchParams({ partner_id: partnerId }).toString();
  const loadScript = `<script
  async
  src="${scriptOrigin}/tracking/wt-google-lp.js?${qs}"
></script>`;
  return `${configScript}\n${loadScript}`;
}

function buildGtmInstructions(scriptOrigin: string, partnerId: string, config: GoogleLpTrackingStored): string {
  const snippet = buildSnippetBlock(scriptOrigin, partnerId, config);
  return `1. No Google Tag Manager, crie uma nova tag do tipo **HTML personalizado**.\n2. Cole o snippet abaixo (mesmo código da instalação direta).\n3. Acionador: **Initialization – All Pages** ou **DOM pronto** apenas nas páginas de destino do Google Ads.\n4. Publique o contêiner.\n\n--- Snippet ---\n\n${snippet}`;
}

export default function GoogleLpTrackingPage() {
  const { partnerId, partnerName, isLoading, error: partnerError } = useRequiredPartner();
  const [origin, setOrigin] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const [protocolMessageTemplate, setProtocolMessageTemplate] = useState(
    DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate
  );
  const [whatsappPhone, setWhatsappPhone] = useState(DEFAULT_GOOGLE_LP_TRACKING.whatsappPhone);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setOrigin(getPublicSiteUrlForClient());
  }, []);

  const loadSettings = useCallback(async () => {
    if (!partnerId) return;
    setSettingsLoaded(false);
    try {
      const res = await authFetch("/api/settings/google-lp-tracking", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      const c = data.config as GoogleLpTrackingStored | undefined;
      if (c) {
        setProtocolMessageTemplate(c.protocolMessageTemplate);
        setWhatsappPhone(c.whatsappPhone ?? "");
      }
    } catch {
      setProtocolMessageTemplate(DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate);
      setWhatsappPhone(DEFAULT_GOOGLE_LP_TRACKING.whatsappPhone);
    } finally {
      setSettingsLoaded(true);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const scriptOrigin = useMemo(() => {
    const o = origin.trim();
    if (o) return o.replace(/\/$/, "");
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  }, [origin]);

  const trackingConfig: GoogleLpTrackingStored = useMemo(
    () => ({
      protocolMessageTemplate: protocolMessageTemplate.trim().slice(0, 1000),
      whatsappPhone: sanitizeWhatsAppPhone(whatsappPhone),
      whatsappLinkHosts: DEFAULT_GOOGLE_LP_TRACKING.whatsappLinkHosts,
      redirectAllowedHosts: [],
    }),
    [protocolMessageTemplate, whatsappPhone]
  );

  const directSnippet = useMemo(() => {
    if (!partnerId || !scriptOrigin) return "";
    return buildSnippetBlock(scriptOrigin, partnerId, trackingConfig);
  }, [partnerId, scriptOrigin, trackingConfig]);

  const gtmText = useMemo(() => {
    if (!partnerId || !scriptOrigin) return "";
    return buildGtmInstructions(scriptOrigin, partnerId, trackingConfig);
  }, [partnerId, scriptOrigin, trackingConfig]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("err");
      setTimeout(() => setCopyState("idle"), 3000);
    }
  }, []);

  const handleSave = async () => {
    if (!partnerId) return;
    setSaveStatus("loading");
    setSaveMessage("");
    try {
      const res = await authFetch("/api/settings/google-lp-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        partnerId,
        body: JSON.stringify({
          protocolMessageTemplate: protocolMessageTemplate.trim().slice(0, 1000),
          whatsappPhone: sanitizeWhatsAppPhone(whatsappPhone),
          whatsappLinkHosts: DEFAULT_GOOGLE_LP_TRACKING.whatsappLinkHosts,
          redirectAllowedHosts: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      if (data.config) {
        const c = data.config as GoogleLpTrackingStored;
        setProtocolMessageTemplate(c.protocolMessageTemplate);
        setWhatsappPhone(c.whatsappPhone ?? "");
      }
      setSaveStatus("success");
      setSaveMessage("Preferências salvas. Copie o snippet de novo se já estiver publicado no site.");
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const handleRestoreDefaults = () => {
    setProtocolMessageTemplate(DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate);
    setWhatsappPhone(DEFAULT_GOOGLE_LP_TRACKING.whatsappPhone);
    setSaveMessage("");
    setSaveStatus("idle");
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
            Google Ads — rastreamento na landing
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            O arquivo <code className="text-xs bg-[var(--muted)] px-1 rounded">/tracking/wt-google-lp.js</code> é{" "}
            <strong className="text-[var(--foreground)]">minificado</strong> no build; a fonte legível está em{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">scripts/tracking/wt-google-lp.source.js</code>{" "}
            (após alterar, rode <code className="text-xs bg-[var(--muted)] px-1 rounded">pnpm run build:tracking</code>
            ).
          </p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Script para capturar <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code>,{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">wbraid</code>,{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">gbraid</code> e UTMs na primeira visita (cookies
            first-touch) e trocar links de WhatsApp por <code className="text-xs bg-[var(--muted)] px-1 rounded">/go</code>.
            No clique, o <code className="text-xs bg-[var(--muted)] px-1 rounded">/go</code> gera o protocolo e abre o
            WhatsApp do cliente com a mensagem configurada.
          </p>
        </div>

        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa…</p>}

        {!isLoading && partnerId && (
          <>
            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Personalização (snippet)</CardTitle>
                <CardDescription>
                  Esses valores entram no primeiro <code className="text-xs">&lt;script&gt;</code> do snippet (objeto{" "}
                  <code className="text-xs">window.__WT_GOOGLE_LP</code>) e são lidos pelo script da pasta{" "}
                  <code className="text-xs">/tracking</code>. Use{" "}
                  <code className="text-xs">{"{{emr_id}}"}</code> para o ID da campanha EMR e{" "}
                  <code className="text-xs">{"{{protocol}}"}</code> para o código do WhatsApp Tracking (ex.:{" "}
                  <code className="text-xs">ID#00111 - GLP-…</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!settingsLoaded && <p className="text-sm text-[var(--muted-foreground)]">Carregando preferências…</p>}
                <div className="space-y-2">
                  <Label htmlFor="protocol-template">Mensagem Inicial</Label>
                  <Textarea
                    id="protocol-template"
                    value={protocolMessageTemplate}
                    onChange={(e) => setProtocolMessageTemplate(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    className="font-mono text-sm"
                    placeholder={DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate}
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    <code className="bg-[var(--muted)] px-1 rounded">{"{{emr_id}}"}</code> vem do link{" "}
                    <code className="bg-[var(--muted)] px-1 rounded">/go?emr_id=…</code> (campanha cadastrada abaixo).{" "}
                    <code className="bg-[var(--muted)] px-1 rounded">{"{{protocol}}"}</code> é gerado no clique e usado
                    para conciliar gclid com a conversa no Octadesk.
                  </p>
                  {settingsLoaded && !/\{\{\s*emr_(campaign_)?id\s*\}\}/i.test(protocolMessageTemplate) && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Este modelo não inclui <code className="bg-[var(--muted)] px-1 rounded">{"{{emr_id}}"}</code>. O
                      app passará a prefixar o ID EMR automaticamente quando o link tiver{" "}
                      <code className="bg-[var(--muted)] px-1 rounded">emr_id=</code>; recomendado:{" "}
                      <code className="bg-[var(--muted)] px-1 rounded">{DEFAULT_GOOGLE_LP_TRACKING.protocolMessageTemplate}</code>
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp-phone">WhatsApp do cliente</Label>
                  <Input
                    id="whatsapp-phone"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="5511999999999"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Use DDI + DDD + número, sem espaços. Ex.:{" "}
                    <code className="bg-[var(--muted)] px-1 rounded">5511999999999</code>. Se esse campo estiver salvo,
                    o link <code className="bg-[var(--muted)] px-1 rounded">/go</code> pode abrir o WhatsApp sem precisar
                    receber <code className="bg-[var(--muted)] px-1 rounded">next=</code>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
                    disabled={saveStatus === "loading"}
                    onClick={() => void handleSave()}
                  >
                    {saveStatus === "loading" ? "Salvando…" : "Salvar preferências"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleRestoreDefaults}>
                    Restaurar padrões
                  </Button>
                </div>
                {saveMessage && (
                  <p
                    className={`text-sm ${saveStatus === "success" ? "text-[var(--accent)]" : saveStatus === "error" ? "text-red-600 dark:text-red-400" : ""}`}
                  >
                    {saveMessage}
                  </p>
                )}
              </CardContent>
            </Card>

            <EmrCampaignLinksCard partnerId={partnerId} scriptOrigin={scriptOrigin} />

            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Como usar no Google Ads</CardTitle>
                <CardDescription>
                  Cada campanha usa o link exclusivo do bloco &quot;Campanhas EMR&quot; acima — não há um link único
                  para todas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Cadastre o ID EMR (ex. ID#00111) e copie o link daquela linha.</li>
                  <li>
                    Cole na <strong className="text-[var(--foreground)]">URL final</strong> do anúncio; o Google
                    acrescenta o <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code>.
                  </li>
                  <li>
                    No clique, a mensagem no WhatsApp sai como{" "}
                    <code className="text-xs bg-[var(--muted)] px-1 rounded">ID#00111 - GLP-…</code>.
                  </li>
                </ol>
                <p className="text-xs">
                  Formato:{" "}
                  <code className="bg-[var(--muted)] px-1 rounded">…/go?partner_id=…&amp;emr_id=ID%2300111</code> — um{" "}
                  <code className="bg-[var(--muted)] px-1 rounded">emr_id</code> por campanha.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Sua empresa</CardTitle>
                <CardDescription>
                  Com a empresa <span className="font-medium text-[var(--foreground)]">{partnerName}</span> selecionada
                  aqui no app, o snippet já inclui o ID na URL do script (
                  <code className="text-xs">partner_id=…</code>) — não precisa configurar tenant na landing além de
                  colar o código.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                <p>
                  Os cookies first-touch usam o prefixo fixo do produto:{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">{COOKIE_PREFIX}_gclid</code>,{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">{COOKIE_PREFIX}_utm_campaign</code>, etc., com
                  validade <strong className="text-[var(--foreground)]">90 dias</strong> (fixo no script). O parâmetro{" "}
                  <code className="text-xs">gclid</code> continua vindo na URL da campanha Google.
                </p>
                {!scriptOrigin && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Defina <code className="text-xs">NEXT_PUBLIC_SITE_URL</code> no deploy se o snippet precisar de URL
                    fixa fora deste domínio.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Instalação direta (HTML do site)</CardTitle>
                <CardDescription>
                  Dois blocos: configuração inline + script externo. Cole antes do fechamento de{" "}
                  <code className="text-xs">&lt;body&gt;</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="text-xs overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 font-mono whitespace-pre-wrap break-all">
                  {directSnippet || "Carregando…"}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!directSnippet}
                  onClick={() => void copy(directSnippet)}
                >
                  Copiar snippet
                </Button>
                {copyState === "ok" && <p className="text-sm text-[var(--accent)]">Copiado.</p>}
                {copyState === "err" && <p className="text-sm text-red-600 dark:text-red-400">Não foi possível copiar.</p>}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Google Tag Manager</CardTitle>
                <CardDescription>Tag HTML personalizada com o mesmo código; veja passos no bloco abaixo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="text-xs overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 font-mono whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                  {gtmText || "Carregando…"}
                </pre>
                <Button type="button" variant="outline" disabled={!gtmText} onClick={() => void copy(gtmText)}>
                  Copiar instruções + snippet
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[var(--border)] bg-[var(--muted)]/30 shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Próximos passos (produto)</CardTitle>
                <CardDescription>O que ainda falta no fluxo completo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
                <p>
                  <strong className="text-[var(--foreground)]">Conciliação (ativo):</strong> ao importar do Octadesk, o
                  protocolo na primeira mensagem preenche <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code> e
                  UTMs no lead e no funil (coluna <strong className="text-[var(--foreground)]">Canal → Google Ads</strong>).
                </p>
                <p>
                  <strong className="text-[var(--foreground)]">Octadesk / primeira mensagem:</strong> ainda vale validar com
                  JSON real da EMR se algum tenant não expuser o texto do protocolo nos campos que o parser lê hoje.
                </p>
                <p>
                  <strong className="text-[var(--foreground)]">Depuração:</strong>{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">window.wtGoogleLp.getAttribution()</code>,{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">.buildGoHref(&quot;https://wa.me/…&quot;)</code>,{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">.getProtocolMessageTemplate()</code>,{" "}
                  <code className="text-xs bg-[var(--muted)] px-1 rounded">.isWhatsAppHref(&quot;https://wa.me/…&quot;)</code>
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-sm text-[var(--muted-foreground)]">
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">
            ← Voltar às configurações
          </Link>
        </p>
      </div>
    </main>
  );
}
