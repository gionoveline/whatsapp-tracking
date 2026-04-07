"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import Link from "next/link";

type Props = { partnerId: string };

function formatIntervalLabel(minutes: number): string {
  if (minutes >= 1440) return `${minutes / 1440} dia`;
  if (minutes >= 60) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/**
 * Documentacao in-product: sync automatico via API Octadesk + agendamento (Vercel Pro ou HTTP externo).
 */
export function DeskOctadeskSyncInfo({ partnerId }: Props) {
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [intervalOptions, setIntervalOptions] = useState<number[]>([10]);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [intervalLoading, setIntervalLoading] = useState(true);
  const [intervalSaveStatus, setIntervalSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const loadInterval = useCallback(async () => {
    setIntervalLoading(true);
    const res = await authFetch("/api/settings/desk-sync-interval", { partnerId });
    const data = (await res.json().catch(() => ({}))) as {
      intervalMinutes?: number;
      options?: number[];
      error?: string;
    };
    setIntervalLoading(false);
    if (res.ok && typeof data.intervalMinutes === "number") {
      setIntervalMinutes(data.intervalMinutes);
      if (Array.isArray(data.options) && data.options.length) {
        setIntervalOptions(data.options as number[]);
      }
    }
  }, [partnerId]);

  useEffect(() => {
    void loadInterval();
  }, [loadInterval]);

  const saveInterval = async (next: number) => {
    setIntervalSaveStatus("saving");
    const res = await authFetch("/api/settings/desk-sync-interval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ intervalMinutes: next }),
    });
    const data = (await res.json().catch(() => ({}))) as { intervalMinutes?: number; error?: string };
    if (!res.ok) {
      setIntervalSaveStatus("error");
      return;
    }
    if (typeof data.intervalMinutes === "number") {
      setIntervalMinutes(data.intervalMinutes);
    }
    setIntervalSaveStatus("saved");
    window.setTimeout(() => setIntervalSaveStatus("idle"), 2000);
  };

  const runSampleImport = async () => {
    setImporting(true);
    setImportMsg(null);
    const res = await authFetch("/api/settings/desk-import-octadesk-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ limit: 20, providerId: "octadesk" }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setImporting(false);
    if (!res.ok) {
      setImportMsg(typeof data.error === "string" ? data.error : "Falha na importacao.");
      return;
    }
    setImportMsg(
      `Importacao: ${String(data.imported ?? 0)} gravados, ${String(data.skipped ?? 0)} ignorados, ${String(data.failed ?? 0)} falhas.`
    );
  };

  return (
    <Card className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Sincronizacao automatica (API Octadesk)</CardTitle>
        <CardDescription className="text-pretty">
          Com a <strong>Base URL</strong> e o <strong>token da API</strong> salvos acima, o backend passa a puxar conversas do
          Octadesk sozinho: novos leads CTWA e atualizacao de tags para <strong>SQL</strong> (via marcadores configurados).
          <strong> Nao e obrigatorio</strong> configurar webhooks no Octadesk para o fluxo minimo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-4 space-y-3">
          <div>
            <Label htmlFor="desk-sync-interval" className="text-[var(--foreground)]">
              Frequencia minima entre sincronizacoes
            </Label>
            <p className="text-xs mt-1 mb-2">
              O servidor so executa uma rodada completa depois deste intervalo, mesmo que o agendador chame a URL com mais
              frequencia. Assim voce pode usar um cron HTTP a cada 1 min no plano Free e manter sync efetivo a cada 15 min, por
              exemplo.
            </p>
            {intervalLoading ? (
              <p className="text-xs">Carregando...</p>
            ) : (
              <select
                id="desk-sync-interval"
                className="mt-1 flex h-9 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-sm text-[var(--foreground)] shadow-sm"
                value={intervalMinutes}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  setIntervalMinutes(v);
                  void saveInterval(v);
                }}
              >
                {intervalOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatIntervalLabel(m)}
                  </option>
                ))}
              </select>
            )}
            {intervalSaveStatus === "saving" && <p className="text-xs mt-1">Salvando...</p>}
            {intervalSaveStatus === "saved" && <p className="text-xs mt-1 text-emerald-600 dark:text-emerald-400">Salvo.</p>}
            {intervalSaveStatus === "error" && (
              <p className="text-xs mt-1 text-red-600 dark:text-red-400">Nao foi possivel salvar. Tente de novo.</p>
            )}
          </div>
          <p className="text-xs border-t border-[var(--border)] pt-3">
            <strong className="text-[var(--foreground)]">Plano Free (Hobby):</strong> cron nativo da Vercel e no maximo 1x/dia.
            Configure um agendador HTTP (ex. cron-job.org) para chamar{" "}
            <code className="text-[11px] font-mono">/api/cron/octadesk-sync</code> com{" "}
            <code className="text-[11px] font-mono">Authorization: Bearer {"<CRON_SECRET>"}</code> na mesma cadencia ou mais
            frequente que o intervalo escolhido.
          </p>
          <p className="text-xs">
            <strong className="text-[var(--foreground)]">Pro:</strong> ajuste o{" "}
            <code className="text-[11px] font-mono">vercel.json</code> para um periodo menor ou igual ao intervalo (ex. cron a
            cada 5 min e intervalo 5–10 min) para o SLA acompanhar a configuracao.
          </p>
        </div>

        <div>
          <p className="font-medium text-[var(--foreground)] mb-1">SLA tipico</p>
          <p>
            Com intervalo de <strong className="text-[var(--foreground)]">{formatIntervalLabel(intervalMinutes)}</strong>, novos
            dados e virada para SQL tendem a aparecer dentro desse prazo apos a ultima rodada bem-sucedida (mais o tempo do
            agendador).
          </p>
        </div>
        <div>
          <p className="font-medium text-[var(--foreground)] mb-1">Deploy na Vercel</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Defina <code className="text-xs font-mono">CRON_SECRET</code>. A rota{" "}
              <code className="text-xs font-mono">/api/cron/octadesk-sync</code> exige{" "}
              <code className="text-xs font-mono">Authorization: Bearer {"<CRON_SECRET>"}</code>.
            </li>
            <li>
              O <code className="text-xs font-mono">vercel.json</code> do repositorio agenda exemplo a cada 10 min (valido no
              Pro). No Hobby, remova ou altere os crons se o deploy reclamar, e use agendador externo.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-[var(--foreground)] mb-1">Webhooks (opcional)</p>
          <p>
            Para eventos instantaneos, ainda pode usar{" "}
            <Link href="/configuracoes/webhooks" className="text-[var(--accent)] hover:underline underline-offset-2">
              Webhooks
            </Link>
            . Sao complementares ao sync por API.
          </p>
        </div>
        <div className="pt-2 border-t border-[var(--border)]">
          <p className="font-medium text-[var(--foreground)] mb-2">Teste manual (amostra)</p>
          <p className="mb-2">
            Importa ate 20 conversas da primeira pagina de <code className="text-xs font-mono">GET /chat</code> (mesma logica do
            job; CAPI desligado).
          </p>
          <Button type="button" variant="secondary" size="sm" disabled={importing} onClick={() => void runSampleImport()}>
            {importing ? "Importando…" : "Importar amostra (20)"}
          </Button>
          {importMsg && <p className="mt-2 text-xs text-[var(--foreground)]">{importMsg}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
