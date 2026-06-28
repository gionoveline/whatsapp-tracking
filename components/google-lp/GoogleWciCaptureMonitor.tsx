"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/client-auth";
import type { GoogleLpMonitoringResponse } from "@/lib/google-lp-monitoring";
import { GoogleLpCaptureEventRow } from "@/components/google-lp/GoogleLpCaptureEventRow";
import { isWciSmokeTestGclid } from "@/lib/google-wci-smoke-test";

type Props = {
  partnerId: string;
  /** Destaca linha do teste guiado (gclid WT_SMOKE_…). */
  highlightGclid?: string | null;
  /** Janela em horas (WCI tem pouco volume — padrão 7 dias). */
  hours?: number;
};

export function GoogleWciCaptureMonitor({ partnerId, highlightGclid, hours = 168 }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GoogleLpMonitoringResponse | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    if (!partnerId) return;
    setError(null);
    try {
      const res = await authFetch(
        `/api/settings/google-lp-monitoring?hours=${hours}&limit=50&source=wci`,
        { partnerId }
      );
      const body = (await res.json().catch(() => ({}))) as GoogleLpMonitoringResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Falha ao carregar monitoria WCI.");
      setData(body);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [partnerId, hours]);

  useEffect(() => {
    if (highlightGclid?.trim()) setAutoRefresh(true);
  }, [highlightGclid]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh || !partnerId) return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, partnerId, load]);

  const wci = data?.wciSummary;
  const events = data?.events ?? [];
  const highlightTrimmed = highlightGclid?.trim() ?? "";
  const smokeHighlightActive = Boolean(highlightTrimmed && isWciSmokeTestGclid(highlightTrimmed));
  const windowLabel = hours >= 168 ? "7 dias" : hours >= 24 ? `${hours}h` : `${hours}h`;

  return (
    <Card id="wci" className="rounded-2xl border-[var(--border)] shadow-sm scroll-mt-6">
      <CardHeader>
        <CardTitle className="font-display text-lg">Monitoria WCI (extensão WhatsApp)</CardTitle>
        <CardDescription>
          Cliques em <code className="text-xs bg-[var(--muted)] px-1 rounded">/wci</code> — extensões de mensagem /
          click-to-WhatsApp no Google Ads, sem landing. O lead só aparece depois de{" "}
          <strong className="text-[var(--foreground)]">enviar</strong> a mensagem com protocolo GLP no WhatsApp.
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
            href="/configuracoes/google-lp#wci-smoke"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--muted)]/40"
          >
            Teste guiado WCI →
          </Link>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {smokeHighlightActive && !loading && (
          <p className="text-sm rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 px-4 py-3">
            Destaque: teste WCI com gclid{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">{highlightTrimmed}</code>
            {events.some((e) => e.gclid?.trim() === highlightTrimmed)
              ? " — registro encontrado abaixo."
              : " — ainda não apareceu; envie a mensagem no WhatsApp ou clique em Atualizar."}
          </p>
        )}

        {wci?.hasClicksWithoutLead && !loading && (
          <p className="text-sm rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3">
            Há cliques WCI de produção no período, mas <strong>nenhum virou lead</strong>. Confira se o usuário envia a
            mensagem pré-preenchida no WhatsApp e se o sync Octadesk está ativo.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            { label: `Cliques WCI (${windowLabel})`, value: wci?.wciClicks ?? 0 },
            { label: "Produção (sem smoke)", value: wci?.productionClicks ?? 0 },
            { label: "Testes painel", value: wci?.smokeTests ?? 0 },
            { label: "Com gclid", value: wci?.withGclid ?? 0 },
            { label: "Vinculados a lead", value: wci?.linked ?? 0 },
            { label: "Aguardando WhatsApp", value: wci?.awaitingWhatsApp ?? 0 },
            {
              label: "% lead (prod.)",
              value: wci?.linkRatePercent != null ? `${wci.linkRatePercent}%` : loading ? "…" : "—",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">{item.label}</p>
              <p className="text-xl font-semibold tabular-nums">{loading ? "…" : item.value}</p>
            </div>
          ))}
        </div>

        {events.length === 0 && !loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum clique WCI no período. Use o link <strong className="text-[var(--foreground)]">/wci</strong> da
            campanha EMR na URL final da extensão de mensagem no Google Ads.
          </p>
        ) : (
          <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Horário</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Protocolo</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">ID EMR</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">gclid</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Mensagem</th>
                  <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-[var(--muted-foreground)]">
                      Carregando eventos WCI…
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <GoogleLpCaptureEventRow
                      key={event.id}
                      event={event}
                      showOrigin={false}
                      highlighted={Boolean(highlightTrimmed && event.gclid?.trim() === highlightTrimmed)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
