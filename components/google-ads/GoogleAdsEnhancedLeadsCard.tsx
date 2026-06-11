"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/client-auth";

type Settings = {
  enabled: boolean;
  shadowMode: boolean;
  usePhone: boolean;
  useEmail: boolean;
};

type Stats7d = {
  total: number;
  wouldSend: number;
  withPhone: number;
  withEmail: number;
  withBoth: number;
};

type LiveStats7d = {
  sentClickId: number;
  sentEnhancedLead: number;
  sentLegacyUnknown: number;
  sentTotal: number;
};

type Props = {
  partnerId: string;
};

export function GoogleAdsEnhancedLeadsCard({ partnerId }: Props) {
  const [settings, setSettings] = useState<Settings>({
    enabled: false,
    shadowMode: true,
    usePhone: true,
    useEmail: true,
  });
  const [stats7d, setStats7d] = useState<Stats7d | null>(null);
  const [liveStats7d, setLiveStats7d] = useState<LiveStats7d | null>(null);
  const [pendingGlpSql, setPendingGlpSql] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!partnerId) return;
    void (async () => {
      const res = await authFetch("/api/settings/google-ads-enhanced-leads", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (data.settings) setSettings(data.settings);
      if (data.stats7d) setStats7d(data.stats7d);
      if (data.liveStats7d) setLiveStats7d(data.liveStats7d);
      if (typeof data.pendingGlpSql === "number") setPendingGlpSql(data.pendingGlpSql);
    })();
  }, [partnerId]);

  const save = async () => {
    setStatus("loading");
    setMessage("");
    const res = await authFetch("/api/settings/google-ads-enhanced-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setMessage(data.error ?? "Falha ao salvar.");
      return;
    }
    setStatus("success");
    setMessage("Configuração salva.");
    const refresh = await authFetch("/api/settings/google-ads-enhanced-leads", { partnerId });
    const refreshed = await refresh.json().catch(() => ({}));
    if (refreshed.stats7d) setStats7d(refreshed.stats7d);
    if (refreshed.liveStats7d) setLiveStats7d(refreshed.liveStats7d);
    if (typeof refreshed.pendingGlpSql === "number") setPendingGlpSql(refreshed.pendingGlpSql);
  };

  const liveActive = settings.enabled && !settings.shadowMode;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enhanced Conversions for Leads</CardTitle>
        <CardDescription>
          Path B: SQL Google LP sem click id enviados com telefone/e-mail hasheados. Com shadow ativo, só registra
          elegibilidade; com shadow desligado, envia ao Google Ads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
          />
          Ativar EC for Leads (Path B)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.shadowMode}
            onChange={(e) => setSettings((s) => ({ ...s, shadowMode: e.target.checked }))}
          />
          Shadow mode (não envia ao Google)
        </label>
        {liveActive ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Envio real ativo — novos SQL sem gclid serão enviados via EC for Leads.
          </p>
        ) : settings.enabled ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Shadow ativo — apenas medição. Desligue shadow para envio real.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.usePhone}
              onChange={(e) => setSettings((s) => ({ ...s, usePhone: e.target.checked }))}
            />
            Usar telefone
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.useEmail}
              onChange={(e) => setSettings((s) => ({ ...s, useEmail: e.target.checked }))}
            />
            Usar e-mail
          </label>
        </div>

        {stats7d && settings.shadowMode && (
          <div className="rounded-xl border border-[var(--border)] p-3 text-sm space-y-1">
            <p className="font-medium text-[var(--foreground)]">Shadow SQL (7 dias)</p>
            <p className="text-[var(--muted-foreground)]">Eventos: {stats7d.total}</p>
            <p className="text-[var(--muted-foreground)]">Elegíveis (would send): {stats7d.wouldSend}</p>
            <p className="text-[var(--muted-foreground)]">Com telefone: {stats7d.withPhone}</p>
            <p className="text-[var(--muted-foreground)]">Com e-mail: {stats7d.withEmail}</p>
            <p className="text-[var(--muted-foreground)]">Com ambos: {stats7d.withBoth}</p>
          </div>
        )}

        {liveStats7d && (
          <div className="rounded-xl border border-[var(--border)] p-3 text-sm space-y-1">
            <p className="font-medium text-[var(--foreground)]">SQL Google LP enviados (7 dias)</p>
            <p className="text-[var(--muted-foreground)]">
              Path A (click_id / com gclid): {liveStats7d.sentClickId}
            </p>
            <p className="text-[var(--muted-foreground)]">
              Path B (enhanced_lead / sem gclid): {liveStats7d.sentEnhancedLead}
            </p>
            {liveStats7d.sentLegacyUnknown > 0 ? (
              <p className="text-[var(--muted-foreground)]">
                Legado (sem match_method): {liveStats7d.sentLegacyUnknown}
              </p>
            ) : null}
            <p className="text-[var(--muted-foreground)]">Total enviados: {liveStats7d.sentTotal}</p>
            {pendingGlpSql != null ? (
              <p
                className={
                  pendingGlpSql > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-[var(--muted-foreground)]"
                }
              >
                SQL Google LP pendentes de envio: {pendingGlpSql}
              </p>
            ) : null}
          </div>
        )}

        <p className="text-xs text-[var(--muted-foreground)]">
          E-mails placeholder Octadesk (<code className="text-xs">@octachat.com</code>) e domínio operador não são
          enviados ao Google — só telefone ou e-mail real do lead.
        </p>

        <Button type="button" onClick={() => void save()} disabled={status === "loading"}>
          {status === "loading" ? "Salvando…" : "Salvar"}
        </Button>
        {message ? (
          <p
            className={`text-sm ${status === "success" ? "text-[var(--accent)]" : status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
          >
            {message}
          </p>
        ) : null}
        <p className="text-xs text-[var(--muted-foreground)]">
          Pré-requisito Google: EC for Leads ON na action SQL de cada conta. Backfill retroativo:{" "}
          <code className="text-xs">scripts/backfill-google-enhanced-sql.ts</code>
        </p>
      </CardContent>
    </Card>
  );
}
