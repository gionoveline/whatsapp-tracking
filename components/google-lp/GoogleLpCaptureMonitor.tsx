"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/client-auth";
import type { GoogleLpCaptureEvent, GoogleLpMonitoringResponse } from "@/lib/google-lp-monitoring";
import { googleLpCaptureSourceLabel } from "@/lib/google-lp-capture-source";

type Props = {
  partnerId: string;
};

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

function truncateGclid(gclid: string | null): string {
  if (!gclid) return "—";
  if (gclid.length <= 20) return gclid;
  return `${gclid.slice(0, 18)}…`;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      {label}
    </span>
  );
}

function EventRow({ event }: { event: GoogleLpCaptureEvent }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0 align-top">
      <td className="p-2 whitespace-nowrap">{formatDateTimeBr(event.createdAt)}</td>
      <td className="p-2 font-mono text-xs">{event.protocol}</td>
      <td className="p-2 font-mono text-xs">{event.emrCampaignId ?? "—"}</td>
      <td className="p-2 text-xs whitespace-nowrap">
        {googleLpCaptureSourceLabel(event.captureSource)}
      </td>
      <td className="p-2 font-mono text-xs" title={event.gclid ?? undefined}>
        {truncateGclid(event.gclid)}
      </td>
      <td className="p-2 text-xs max-w-[200px]">
        <p className="line-clamp-2 text-[var(--muted-foreground)]" title={event.messagePreview}>
          {event.messagePreview || "—"}
        </p>
      </td>
      <td className="p-2">
        <div className="flex flex-col gap-1">
          {event.status === "linked" ? (
            <StatusBadge ok={true} label="Lead vinculado" />
          ) : (
            <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              Aguardando WhatsApp
            </span>
          )}
          <div className="flex flex-wrap gap-1">
            <StatusBadge ok={event.checks.hasGclid} label="gclid" />
            <StatusBadge ok={event.checks.hasEmr} label="ID EMR" />
            <StatusBadge ok={event.checks.messageHasProtocol} label="GLP na msg" />
            {event.checks.leadGclidMatches !== null && (
              <StatusBadge ok={event.checks.leadGclidMatches} label="gclid no lead" />
            )}
          </div>
          {event.lead?.contactPhone && (
            <p className="text-xs text-[var(--muted-foreground)]">{event.lead.contactPhone}</p>
          )}
        </div>
      </td>
    </tr>
  );
}

export function GoogleLpCaptureMonitor({ partnerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GoogleLpMonitoringResponse | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    if (!partnerId) return;
    setError(null);
    try {
      const res = await authFetch("/api/settings/google-lp-monitoring?hours=24&limit=50", {
        partnerId,
      });
      const body = (await res.json().catch(() => ({}))) as GoogleLpMonitoringResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Falha ao carregar captação Google LP.");
      setData(body);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh || !partnerId) return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, partnerId, load]);

  const summary = data?.summary;

  return (
    <Card id="google-lp" className="rounded-2xl border-[var(--border)] shadow-sm scroll-mt-6">
      <CardHeader>
        <CardTitle className="font-display text-lg">Captação Google LP / WCI</CardTitle>
        <CardDescription>
          Valide cliques em <code className="text-xs bg-[var(--muted)] px-1 rounded">/go</code> (landing) ou{" "}
          <code className="text-xs bg-[var(--muted)] px-1 rounded">/wci</code> (extensão WhatsApp), gclid e mensagem
          inicial (GLP + ID EMR).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
          <Button
            type="button"
            variant={autoRefresh ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            {autoRefresh ? "Auto-refresh 30s (ativo)" : "Auto-refresh 30s"}
          </Button>
          <Link
            href="/configuracoes/google-lp"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--muted)]/40"
          >
            Configurar campanhas →
          </Link>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {summary?.gclidRateLow && !loading && (
          <p className="text-sm rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3">
            Taxa de <strong>gclid</strong> baixa nas últimas 24h (
            {summary.gclidRatePercent ?? 0}% de {summary.protocolsTotal} cliques). Verifique o script na landing e
            se a URL do anúncio repassa parâmetros do Google.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            { label: "Cliques (24h)", value: summary?.protocolsTotal ?? 0 },
            { label: "WCI extensão", value: summary?.wciExtension ?? 0 },
            { label: "Landing", value: summary?.landing ?? 0 },
            { label: "Com gclid", value: summary?.withGclid ?? 0 },
            {
              label: "% com gclid",
              value:
                summary?.gclidRatePercent != null ? `${summary.gclidRatePercent}%` : loading ? "…" : "—",
            },
            { label: "Com ID EMR", value: summary?.withEmr ?? 0 },
            { label: "Vinculados a lead", value: summary?.matched ?? 0 },
            { label: "Leads com gclid (24h)", value: summary?.leadsWithGclidInWindow ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">{item.label}</p>
              <p className="text-xl font-semibold tabular-nums">{loading ? "…" : item.value}</p>
            </div>
          ))}
        </div>

        {(data?.events?.length ?? 0) === 0 && !loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum clique registrado nas últimas 24h. Teste com o link exclusivo em Configurações → Google LP.
          </p>
        ) : (
          <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Horário</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Protocolo</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">ID EMR</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Origem</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">gclid</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Mensagem</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (data?.events?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-[var(--muted-foreground)]">
                      Carregando eventos…
                    </td>
                  </tr>
                ) : (
                  (data?.events ?? []).map((event) => <EventRow key={event.id} event={event} />)
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
