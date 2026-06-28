"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { authFetch } from "@/lib/client-auth";
import {
  buildWciSmokeTestUrl,
  evaluateWciSmokeCapture,
  generateWciSmokeGclid,
  WCI_SMOKE_SESSION_KEY,
  type WciSmokeTestVerdict,
} from "@/lib/google-wci-smoke-test";
import type { GoogleLpCaptureEvent, GoogleLpMonitoringResponse } from "@/lib/google-lp-monitoring";
import { sanitizeEmrCampaignId, type GoogleLpCampaignLinkRow } from "@/lib/google-lp-campaign-links";
import { CopyableGoLinkField } from "@/components/google-lp/CopyableGoLinkField";

const POLL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 40;

type Props = {
  partnerId: string;
  scriptOrigin: string;
  whatsappPhoneConfigured: boolean;
};

type PollState = "idle" | "polling" | "passed" | "failed" | "timeout";

export function GoogleWciSmokeTestCard({ partnerId, scriptOrigin, whatsappPhoneConfigured }: Props) {
  const [campaigns, setCampaigns] = useState<GoogleLpCampaignLinkRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [emrId, setEmrId] = useState("");
  const [smokeGclid, setSmokeGclid] = useState<string | null>(null);
  const [pollState, setPollState] = useState<PollState>("idle");
  const [verdict, setVerdict] = useState<WciSmokeTestVerdict | null>(null);
  const pollAttempts = useRef(0);

  const loadCampaigns = useCallback(async () => {
    if (!partnerId) return;
    setLoadingCampaigns(true);
    try {
      const res = await authFetch("/api/settings/google-lp-campaigns", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      const rows = (data.campaigns as GoogleLpCampaignLinkRow[]) ?? [];
      setCampaigns(rows);
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (campaigns.length > 0 && !emrId) setEmrId(campaigns[0].emr_campaign_id);
  }, [campaigns, emrId]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(WCI_SMOKE_SESSION_KEY);
      if (stored?.startsWith("WT_SMOKE_")) {
        setSmokeGclid(stored);
        setPollState("polling");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const parsedEmrId = useMemo(() => sanitizeEmrCampaignId(emrId), [emrId]);

  const smokeTestUrl = useMemo(() => {
    if (!scriptOrigin || !partnerId || !parsedEmrId || !smokeGclid) return "";
    return buildWciSmokeTestUrl(scriptOrigin, partnerId, parsedEmrId, smokeGclid);
  }, [scriptOrigin, partnerId, parsedEmrId, smokeGclid]);

  const campaignOptions = useMemo(
    () => [
      { value: "", label: loadingCampaigns ? "Carregando…" : "Selecione o ID EMR" },
      ...campaigns.map((c) => ({
        value: c.emr_campaign_id,
        label: c.label ? `${c.emr_campaign_id} — ${c.label}` : c.emr_campaign_id,
      })),
    ],
    [campaigns, loadingCampaigns]
  );

  const pollForCapture = useCallback(
    async (gclid: string): Promise<GoogleLpCaptureEvent | undefined> => {
      const res = await authFetch("/api/settings/google-lp-monitoring?hours=1&limit=30&source=wci", { partnerId });
      const body = (await res.json().catch(() => ({}))) as GoogleLpMonitoringResponse & { error?: string };
      if (!res.ok) return undefined;
      return body.events?.find((e) => e.gclid?.trim() === gclid.trim());
    },
    [partnerId]
  );

  useEffect(() => {
    if (pollState !== "polling" || !smokeGclid) return;

    const tick = async () => {
      pollAttempts.current += 1;
      const event = await pollForCapture(smokeGclid);
      if (event) {
        const result = evaluateWciSmokeCapture(smokeGclid, event);
        setVerdict(result);
        setPollState(result.passed ? "passed" : "failed");
        try {
          sessionStorage.removeItem(WCI_SMOKE_SESSION_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
        setVerdict(evaluateWciSmokeCapture(smokeGclid, undefined));
        setPollState("timeout");
        try {
          sessionStorage.removeItem(WCI_SMOKE_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [pollState, smokeGclid, pollForCapture]);

  const runSmokeTest = () => {
    if (!parsedEmrId || !scriptOrigin) return;
    const gclid = generateWciSmokeGclid();
    pollAttempts.current = 0;
    setSmokeGclid(gclid);
    setVerdict(null);
    setPollState("polling");
    try {
      sessionStorage.setItem(WCI_SMOKE_SESSION_KEY, gclid);
    } catch {
      /* ignore */
    }
    const url = buildWciSmokeTestUrl(scriptOrigin, partnerId, parsedEmrId, gclid);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const resetTest = () => {
    setPollState("idle");
    setSmokeGclid(null);
    setVerdict(null);
    pollAttempts.current = 0;
    try {
      sessionStorage.removeItem(WCI_SMOKE_SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const monitorHref = smokeGclid
    ? `/configuracoes/desk/monitoria?wci_smoke=${encodeURIComponent(smokeGclid)}#wci`
    : "/configuracoes/desk/monitoria#wci";

  return (
    <Card id="wci-smoke" className="rounded-2xl border-[var(--border)] shadow-sm border-l-4 border-l-emerald-600/70 scroll-mt-6">
      <CardHeader>
        <CardTitle className="font-display text-lg">Validar WCI (teste guiado)</CardTitle>
        <CardDescription>
          Abre <code className="text-xs bg-[var(--muted)] px-1 rounded">/wci</code> com um gclid de teste e confere na
          monitoria se origem e atribuição foram capturadas — sem depender de clique em anúncio real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!whatsappPhoneConfigured && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3">
            Salve o telefone WhatsApp padrão acima antes do teste (redirect sem{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">next=</code>).
          </p>
        )}

        <div className="space-y-2 max-w-md">
          <Label htmlFor="wci-smoke-emr">ID EMR do teste</Label>
          <Select
            id="wci-smoke-emr"
            value={parsedEmrId ?? ""}
            onValueChange={setEmrId}
            options={campaignOptions}
            disabled={loadingCampaigns || campaigns.length === 0}
          />
          {campaigns.length === 0 && !loadingCampaigns && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Cadastre ao menos uma campanha EMR no bloco acima para rodar o teste.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
            disabled={!parsedEmrId || !scriptOrigin || !whatsappPhoneConfigured || pollState === "polling"}
            onClick={runSmokeTest}
          >
            {pollState === "polling" ? "Aguardando captura…" : "Executar teste WCI"}
          </Button>
          {(pollState === "passed" || pollState === "failed" || pollState === "timeout") && (
            <Button type="button" variant="outline" onClick={resetTest}>
              Novo teste
            </Button>
          )}
          <Link
            href={monitorHref}
            className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--muted)]/40"
          >
            Abrir monitoria →
          </Link>
        </div>

        {smokeGclid && smokeTestUrl && (
          <CopyableGoLinkField
            url={smokeTestUrl}
            label="URL do teste (gclid WT_SMOKE_…)"
            inputId="wci-smoke-url"
            emptyHint=""
          />
        )}

        {pollState === "polling" && smokeGclid && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Procure o protocolo na aba que abriu (redirect ao WhatsApp). Atualizando a monitoria a cada 3s… gclid:{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">{smokeGclid}</code>
          </p>
        )}

        {verdict && pollState !== "polling" && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              verdict.passed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            }`}
          >
            <p className="font-medium">{verdict.passed ? "Teste aprovado" : pollState === "timeout" ? "Tempo esgotado" : "Teste com ressalvas"}</p>
            <p className="mt-1 text-sm opacity-90">{verdict.message}</p>
            {verdict.protocol && (
              <p className="mt-2 font-mono text-xs">
                Protocolo: {verdict.protocol}
              </p>
            )}
          </div>
        )}

        <ol className="list-decimal list-inside space-y-1 text-xs text-[var(--muted-foreground)]">
          <li>Clique em <strong className="text-[var(--foreground)]">Executar teste WCI</strong> — abre /wci em nova aba.</li>
          <li>Confira redirect ao WhatsApp com mensagem GLP + ID EMR.</li>
          <li>
            Na monitoria, a linha deve ter origem{" "}
            <strong className="text-[var(--foreground)]">Extensão WhatsApp (WCI)</strong> e badge verde em gclid.
          </li>
          <li>Compare com a URL final no Google Ads: deve ser igual ao link WCI (não /go).</li>
        </ol>
      </CardContent>
    </Card>
  );
}
