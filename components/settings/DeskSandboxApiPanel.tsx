"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetch } from "@/lib/client-auth";

type ProbeResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  note?: string;
  tickets?: unknown;
  chats?: unknown;
  httpStatus?: number;
  request?: string;
  responseIsArray?: boolean;
  rootKeys?: string[] | null;
  ticketCount?: number;
  ctwaStructuredTickets?: number;
  firstTicketKeys?: string[];
  preview?: string;
};

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type NonSqlTagsResult = {
  ok?: boolean;
  error?: string;
  leadsStatusLeadTotal?: number;
  maxChats?: number;
  chatsScanned?: number;
  fetchFailed?: number;
  chatsWithEmptyRootTags?: number;
  tagsNotMatchingSqlMarkers?: { tag: string; chatCount: number }[];
  uniqueTagsRanked?: { tag: string; chatCount: number; matchesSqlMarker: boolean }[];
  sqlMarkersConfigured?: string[];
  note?: string;
};

export function DeskSandboxApiPanel({ partnerId }: { partnerId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [tagsStatus, setTagsStatus] = useState<"idle" | "loading" | "done">("idle");
  const [tagsResult, setTagsResult] = useState<NonSqlTagsResult | null>(null);

  const runListTickets = async () => {
    setStatus("loading");
    setResult(null);
    const res = await authFetch("/api/settings/desk-sandbox-probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ action: "listTickets", providerId: "octadesk" }),
    });
    const data = (await res.json().catch(() => ({}))) as ProbeResult;
    setStatus("done");
    setResult(data);
  };

  const runNonSqlTags = async () => {
    setTagsStatus("loading");
    setTagsResult(null);
    const res = await authFetch("/api/settings/desk-sandbox-non-sql-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ maxChats: 35, providerId: "octadesk" }),
    });
    const data = (await res.json().catch(() => ({}))) as NonSqlTagsResult;
    setTagsStatus("done");
    setTagsResult(data);
  };

  const runImportSample = async () => {
    setImportLoading(true);
    setImportResult(null);
    const res = await authFetch("/api/settings/desk-import-octadesk-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ limit: 100, providerId: "octadesk" }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setImportLoading(false);
    setImportResult(data);
  };

  return (
    <Card className="rounded-2xl border-dashed border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Validacao de API (somente empresa Sandbox)</CardTitle>
        <CardDescription>
          Chama <code className="text-xs font-mono">GET /tickets</code> e{" "}
          <code className="text-xs font-mono">GET /chat</code>. A tela <strong>Conversas</strong> do Octadesk alinha com{" "}
          <code className="text-xs font-mono">/chat</code>; <code className="text-xs font-mono">/tickets</code> e outro
          modulo e pode vir vazio. Abaixo: tags em <code className="text-xs font-mono">item.tags</code> de conversas ainda{" "}
          <em>lead</em> que <strong>nao</strong> batem com os marcadores SQL atuais (para ajustar marcadores).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={status === "loading" || importLoading || tagsStatus === "loading"}
            className="border-amber-600/40"
            onClick={() => void runListTickets()}
          >
            {status === "loading" ? "Chamando..." : "Validar tickets + conversas (API)"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tagsStatus === "loading" || importLoading || status === "loading"}
            className="border-amber-700/50"
            onClick={() => void runNonSqlTags()}
          >
            {tagsStatus === "loading" ? "Analisando tags..." : "Tags nao-SQL (campo raiz tags)"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={importLoading || status === "loading" || tagsStatus === "loading"}
            className="bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-800 dark:hover:bg-amber-700"
            onClick={() => void runImportSample()}
          >
            {importLoading ? "Importando..." : "Importar amostra (ate 100 leads)"}
          </Button>
        </div>

        {tagsResult && (
          <div className="space-y-2 rounded-lg border border-amber-600/30 bg-[var(--background)] p-3">
            {tagsResult.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{tagsResult.error}</p>
            )}
            {tagsResult.ok === true && (
              <>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Leads <em>lead</em> no banco: {tagsResult.leadsStatusLeadTotal ?? 0}; conversas analisadas nesta rodada:{" "}
                  {tagsResult.chatsScanned ?? 0} (max {tagsResult.maxChats ?? 35}). Falhas HTTP: {tagsResult.fetchFailed ?? 0};
                  sem tags na raiz: {tagsResult.chatsWithEmptyRootTags ?? 0}.
                </p>
                <p className="text-xs font-medium text-[var(--foreground)]">
                  Tags que nao batem com nenhum marcador SQL ({tagsResult.tagsNotMatchingSqlMarkers?.length ?? 0} distintas)
                </p>
                <ul className="text-xs font-mono max-h-48 overflow-y-auto space-y-1 list-decimal pl-4">
                  {(tagsResult.tagsNotMatchingSqlMarkers ?? []).map((row) => (
                    <li key={row.tag}>
                      {row.tag} <span className="text-[var(--muted-foreground)]">({row.chatCount} conversas)</span>
                    </li>
                  ))}
                </ul>
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--accent)]">Todas as tags (inclui as que ja batem com SQL)</summary>
                  <ul className="mt-2 font-mono max-h-40 overflow-y-auto space-y-1 list-decimal pl-4">
                    {(tagsResult.uniqueTagsRanked ?? []).map((row) => (
                      <li key={row.tag}>
                        {row.tag} ({row.chatCount}){row.matchesSqlMarker ? " — bate com marcador SQL" : ""}
                      </li>
                    ))}
                  </ul>
                </details>
                {tagsResult.note && <p className="text-xs text-[var(--muted-foreground)] pt-2">{tagsResult.note}</p>}
              </>
            )}
          </div>
        )}

        {importResult && (
          <div className="space-y-2 rounded-lg border border-amber-600/30 bg-[var(--background)] p-3">
            {(importResult.error as string) && (
              <p className="text-sm text-red-600 dark:text-red-400">{String(importResult.error)}</p>
            )}
            <pre className="overflow-x-auto text-xs font-mono max-h-64">{formatJson(importResult)}</pre>
            {importResult.ok === true && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Abra o Dashboard com a empresa Sandbox e o intervalo de datas que cubra os{" "}
                <code className="font-mono">created_at</code> dos leads. Cadastre o token Meta em Configuracoes para
                preencher campanha/conjunto/anuncio quando o <code className="font-mono">source_id</code> for valido na
                Graph API.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            {result.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
            )}
            {result.message && !result.error && (
              <p className="text-sm text-amber-800 dark:text-amber-200">{result.message}</p>
            )}
            {!result.error && Object.keys(result).length > 0 && (
              <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs font-mono max-h-96">
                {formatJson(result)}
              </pre>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--muted-foreground)]">
          Visivel se slug for &quot;sandbox&quot; ou o nome for &quot;Sandbox&quot; / começar com &quot;Sandbox &quot; ou
          &quot;Sandbox-&quot;. Outros tenants recebem 403 neste endpoint.
        </p>
      </CardContent>
    </Card>
  );
}
