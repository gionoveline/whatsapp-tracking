"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/client-auth";
import { useRequiredPartner } from "@/lib/use-required-partner";
import { utcTimeToBrasilia } from "@/lib/timezone-brasilia";

type MonitoringResponse = {
  ok?: boolean;
  providerActive?: string;
  configured?: boolean;
  intervalMinutes?: number;
  dailyTimeUtc?: string;
  lastRunAt?: string | null;
  nextRunAtIso?: string | null;
  sqlMarkers?: string[];
  metrics24h?: { leads: number; sql: number; touched: number };
  metrics7d?: { leads: number; sql: number; touched: number };
  recentRuns?: Array<{
    id: string;
    startedAt: string;
    finishedAt: string;
    status: "success" | "error" | string;
    targetDate: string | null;
    importedCount: number;
    failedCount: number;
    listedCount: number;
    sweepScanned: number;
    sweepImported: number;
    sweepFailed: number;
    metaAttempted: number;
    metaSent: number;
    metaFailed: number;
    metaFailedSummary: string | null;
    errorSummary: string | null;
  }>;
  error?: string;
};

type NonSqlTagsDiagnostics = {
  durationMs?: number;
  listProbe?: {
    httpOk?: boolean;
    httpStatus?: number;
    jsonTopKeys?: string[];
    rowCount?: number;
    firstRowTopKeys?: string[];
  };
  localConversationIdsCount?: number;
  conversationIdsSource?: "local_db" | "octadesk_list" | "octadesk_list_retry_after_empty";
  retriedAnalysisWithFreshOctadeskIds?: boolean;
  inventory?: {
    firstProcessed?: {
      httpStatus?: number;
      httpOk?: boolean;
      parsedJsonTopKeys?: string[];
      unwrappedApplied?: boolean;
      rootTagsCount?: number;
      inventoryStringsCount?: number;
      combinedTagsCount?: number;
      outcome?: "fetch_failed" | "empty_tags" | "has_tags";
    } | null;
  };
};

type NonSqlTagsResponse = {
  uniqueTagsRanked?: { tag: string; chatCount: number; matchesSqlMarker: boolean }[];
  tagsNotMatchingSqlMarkers?: { tag: string; chatCount: number }[];
  chatsScanned?: number;
  fetchFailed?: number;
  chatsWithEmptyRootTags?: number;
  octadeskLeadChats?: number;
  octadeskSqlChats?: number;
  leadsTotal?: number;
  maxChats?: number;
  diagnostics?: NonSqlTagsDiagnostics;
  error?: string;
};

type ReprocessSqlResponse = {
  ok?: boolean;
  dryRun?: boolean;
  maxLeads?: number;
  sqlMarkersConfigured?: string[];
  processed?: {
    scanned: number;
    detailOk: number;
    detailFail: number;
    parseFail: number;
    noConversation: number;
    keptVenda: number;
  };
  reclassification?: {
    unchanged: number;
    wouldChange: number;
    changed: number;
    updateFail: number;
    toLead: number;
    toSql: number;
  };
  error?: string;
};

function formatDateTime(value: string | null | undefined): string {
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
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const hour = pick("hour");
  const minute = pick("minute");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function formatInterval(minutes: number | undefined): string {
  if (!minutes) return "—";
  if (minutes === 1440) return "Diário";
  if (minutes >= 60) return `${minutes / 60}h`;
  return `${minutes} min`;
}

function formatBrasiliaTimeFromUtc(value: string | undefined): string {
  if (!value?.trim()) return "—";
  return `${utcTimeToBrasilia(value)} Brasília`;
}

export default function DeskMonitoriaPage() {
  const { partnerId, error: partnerError, isLoading: isPartnerLoading } = useRequiredPartner();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [nonSqlTags, setNonSqlTags] = useState<NonSqlTagsResponse | null>(null);
  const [reprocessingPreview, setReprocessingPreview] = useState(false);
  const [reprocessingApply, setReprocessingApply] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessSqlResponse | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  const loadMonitoring = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    setError(null);
    const res = await authFetch("/api/settings/desk-monitoring", { partnerId });
    const body = (await res.json().catch(() => ({}))) as MonitoringResponse;
    if (!res.ok) {
      setData(null);
      setError(body.error ?? "Falha ao carregar monitoria.");
      setLoading(false);
      return;
    }
    setData(body);
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    void loadMonitoring();
  }, [loadMonitoring]);

  const handleTestConnection = async () => {
    if (!partnerId) return;
    setTesting(true);
    setTestMsg(null);
    const res = await authFetch("/api/settings/desk-test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ providerId: "octadesk" }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setTesting(false);
    if (!res.ok) {
      setTestMsg(body.message ?? body.error ?? "Falha no teste de conexão.");
      return;
    }
    setTestMsg(body.message ?? "Conexão validada.");
  };

  const handleLoadNonSqlTags = async () => {
    if (!partnerId) return;
    setLoadingTags(true);
    const res = await authFetch("/api/settings/desk-monitoring/non-sql-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ maxChats: 500 }),
    });
    const body = (await res.json().catch(() => ({}))) as NonSqlTagsResponse;
    setLoadingTags(false);
    if (!res.ok) {
      setNonSqlTags({
        ...body,
        error: body.error ?? `Falha na análise (HTTP ${res.status}). Tente menos conversas ou tente de novo.`,
      });
      return;
    }
    setNonSqlTags(body);
  };

  const handleReprocessSql = async (dryRun: boolean) => {
    if (!partnerId) return;
    if (dryRun) setReprocessingPreview(true);
    else setReprocessingApply(true);
    setReprocessError(null);

    const res = await authFetch("/api/settings/desk-monitoring/reprocess-sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ dryRun, maxLeads: 500 }),
    });
    const body = (await res.json().catch(() => ({}))) as ReprocessSqlResponse;

    if (dryRun) setReprocessingPreview(false);
    else setReprocessingApply(false);

    if (!res.ok) {
      setReprocessResult(null);
      setReprocessError(body.error ?? "Falha ao reprocessar classificação SQL.");
      return;
    }

    setReprocessResult(body);
    if (!dryRun) {
      await loadMonitoring();
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
        <h1 className="font-display text-2xl font-semibold">Monitoria</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Acompanhe saúde da integração, fluxo de dados e validação dos marcadores SQL.
        </p>

        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Status da conexão</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? "Carregando..." : data?.configured ? "Configurada" : "Não configurada"}
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Última sincronização</CardTitle>
            </CardHeader>
            <CardContent>{loading ? "Carregando..." : formatDateTime(data?.lastRunAt)}</CardContent>
          </Card>
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Próxima prevista</CardTitle>
            </CardHeader>
            <CardContent>{loading ? "Carregando..." : formatDateTime(data?.nextRunAtIso)}</CardContent>
          </Card>
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Frequência</CardTitle>
            </CardHeader>
            <CardContent>
              {loading
                ? "Carregando..."
                : `${formatInterval(data?.intervalMinutes)}${
                    data?.dailyTimeUtc ? ` (${formatBrasiliaTimeFromUtc(data.dailyTimeUtc)})` : ""
                  }`}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Fluxo de dados</CardTitle>
            <CardDescription>Resumo de atividade das últimas 24h e 7 dias.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-sm font-medium">Últimas 24h</p>
              <p className="text-sm text-[var(--muted-foreground)]">Leads: {data?.metrics24h?.leads ?? 0}</p>
              <p className="text-sm text-[var(--muted-foreground)]">SQL: {data?.metrics24h?.sql ?? 0}</p>
              <p className="text-sm text-[var(--muted-foreground)]">Atualizações: {data?.metrics24h?.touched ?? 0}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-sm font-medium">Últimos 7 dias</p>
              <p className="text-sm text-[var(--muted-foreground)]">Leads: {data?.metrics7d?.leads ?? 0}</p>
              <p className="text-sm text-[var(--muted-foreground)]">SQL: {data?.metrics7d?.sql ?? 0}</p>
              <p className="text-sm text-[var(--muted-foreground)]">Atualizações: {data?.metrics7d?.touched ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Execuções recentes do sync</CardTitle>
            <CardDescription>Últimas rodadas do cron Octadesk para esta empresa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.recentRuns?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhuma execução registrada ainda.</p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Início</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Alvo (UTC)</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Status</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Importação</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Sweep SQL</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Envio Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentRuns ?? []).map((run) => (
                      <tr key={run.id} className="border-b border-[var(--border)] last:border-0 align-top">
                        <td className="p-2">
                          <p>{formatDateTime(run.startedAt)}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            fim: {formatDateTime(run.finishedAt)}
                          </p>
                        </td>
                        <td className="p-2">{run.targetDate ?? "—"}</td>
                        <td className="p-2">
                          {run.status === "success" ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Sucesso</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">Erro</span>
                          )}
                          {run.errorSummary ? (
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">{run.errorSummary}</p>
                          ) : null}
                        </td>
                        <td className="p-2 text-[var(--muted-foreground)]">
                          listados: {run.listedCount} | ok: {run.importedCount} | falhas: {run.failedCount}
                        </td>
                        <td className="p-2 text-[var(--muted-foreground)]">
                          varridos: {run.sweepScanned} | atualizados: {run.sweepImported} | falhas: {run.sweepFailed}
                        </td>
                        <td className="p-2">
                          <p className="text-[var(--muted-foreground)]">
                            tentativas: {run.metaAttempted} | enviados: {run.metaSent} | falhas: {run.metaFailed}
                          </p>
                          {run.metaFailed > 0 ? (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              {run.metaFailedSummary ?? "Falha ao enviar eventos para Meta."}
                            </p>
                          ) : run.metaAttempted > 0 ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Envio Meta OK</p>
                          ) : (
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">Sem envio Meta nesta rodada</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Validação SQL</CardTitle>
            <CardDescription>
              Marcadores ativos e inventário de tags (SQL e não-SQL) considerando leads do cliente no banco.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(data?.sqlMarkers ?? []).map((marker) => (
                <span key={marker} className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1 text-xs">
                  {marker}
                </span>
              ))}
              {(data?.sqlMarkers ?? []).length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">Sem marcadores configurados.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={loadingTags} onClick={() => void handleLoadNonSqlTags()}>
                {loadingTags ? "Analisando tags..." : "Analisar tags (até 500)"}
              </Button>
            </div>
            {nonSqlTags?.error && <p className="text-sm text-red-600 dark:text-red-400">{nonSqlTags.error}</p>}
            {nonSqlTags?.uniqueTagsRanked && nonSqlTags.uniqueTagsRanked.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Tag</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Conversas</th>
                      <th className="text-left p-2 font-medium text-[var(--muted-foreground)]">Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonSqlTags.uniqueTagsRanked.map((row) => (
                      <tr key={`${row.tag}-${row.matchesSqlMarker ? "sql" : "lead"}`} className="border-b border-[var(--border)] last:border-0">
                        <td className="p-2">{row.tag}</td>
                        <td className="p-2">{row.chatCount}</td>
                        <td className="p-2">
                          {row.matchesSqlMarker ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Considerada SQL</span>
                          ) : (
                            <span className="text-[var(--muted-foreground)]">Não-SQL</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {nonSqlTags && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Base local: {nonSqlTags.leadsTotal ?? 0} leads | Conversas analisadas: {nonSqlTags.chatsScanned ?? 0} |
                Falhas na API: {nonSqlTags.fetchFailed ?? 0} | Sem tags detectadas: {nonSqlTags.chatsWithEmptyRootTags ?? 0}
                {" "}(limite: {nonSqlTags.maxChats ?? 500}).
              </p>
            )}
            {nonSqlTags && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Totais coletados no Octadesk (independente de Meta): Leads {nonSqlTags.octadeskLeadChats ?? 0} | SQL{" "}
                {nonSqlTags.octadeskSqlChats ?? 0}
              </p>
            )}
            {nonSqlTags?.diagnostics && (
              <details className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-[var(--foreground)]">
                  Diagnóstico técnico (para suporte)
                </summary>
                <p className="mt-2 text-[var(--muted-foreground)]">
                  Copie o bloco abaixo ao reportar o problema (não contém mensagens nem telefones).
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-[11px] leading-relaxed">
                  {JSON.stringify(nonSqlTags.diagnostics, null, 2)}
                </pre>
              </details>
            )}
            {nonSqlTags?.uniqueTagsRanked && nonSqlTags.uniqueTagsRanked.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhuma tag foi encontrada nas conversas analisadas.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={testing} onClick={() => void handleTestConnection()}>
              {testing ? "Testando..." : "Testar conexão"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadMonitoring()}>
              Atualizar monitoria
            </Button>
            {testMsg && <p className="text-sm text-[var(--muted-foreground)]">{testMsg}</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Reprocessar classificação SQL</CardTitle>
            <CardDescription>
              Reavalia até 500 leads da empresa com os marcadores SQL atuais. Preserve vendas e reclassifique entre
              lead/sql.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={reprocessingPreview || reprocessingApply}
                onClick={() => void handleReprocessSql(true)}
              >
                {reprocessingPreview ? "Simulando..." : "Simular impacto (dry-run)"}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={reprocessingPreview || reprocessingApply}
                onClick={() => void handleReprocessSql(false)}
              >
                {reprocessingApply ? "Aplicando..." : "Aplicar reprocessamento (até 500)"}
              </Button>
            </div>

            {reprocessError && <p className="text-sm text-red-600 dark:text-red-400">{reprocessError}</p>}

            {reprocessResult?.ok && (
              <div className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)] space-y-1">
                <p>
                  Processados: {reprocessResult.processed?.scanned ?? 0} | Conversas válidas:{" "}
                  {reprocessResult.processed?.detailOk ?? 0}
                </p>
                <p>
                  Mudanças previstas: {reprocessResult.reclassification?.wouldChange ?? 0} (para SQL:{" "}
                  {reprocessResult.reclassification?.toSql ?? 0}, para Lead:{" "}
                  {reprocessResult.reclassification?.toLead ?? 0})
                </p>
                <p>
                  {reprocessResult.dryRun
                    ? "Modo simulação: nenhuma linha foi atualizada."
                    : `Aplicado: ${reprocessResult.reclassification?.changed ?? 0} atualizações.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes/desk" className="text-[var(--accent)] hover:underline underline-offset-2">
            ← Voltar para Desk
          </Link>
        </p>
      </div>
    </main>
  );
}
