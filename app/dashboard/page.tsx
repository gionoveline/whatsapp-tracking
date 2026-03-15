"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FunnelRow = {
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adName: string;
  adId: string;
  leads: number;
  sql: number;
  venda: number;
};

type FunnelResponse = {
  from: string | null;
  to: string | null;
  totalLeads: number;
  funnel: FunnelRow[];
};

type ColumnId = "campaign" | "adset" | "ad" | "leads" | "sql" | "venda" | "conversionRate";

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "campaign", label: "Campanha" },
  { id: "adset", label: "Conjunto de anúncios" },
  { id: "ad", label: "Anúncio" },
  { id: "leads", label: "Leads" },
  { id: "sql", label: "SQL" },
  { id: "venda", label: "Venda" },
  { id: "conversionRate", label: "Taxa de conversão" },
];

function conversionRate(vendas: number, leads: number): number {
  if (leads === 0) return 0;
  return Math.round((vendas / leads) * 1000) / 10;
}

export default function DashboardPage() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(
    new Set(["campaign", "adset", "ad", "leads", "sql", "venda", "conversionRate"])
  );
  const [sheetsHint, setSheetsHint] = useState(false);

  const toggleCol = (id: ColumnId) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/funnel?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const json: FunnelResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar funil");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalSql = data?.funnel.reduce((s, r) => s + r.sql, 0) ?? 0;
  const totalVenda = data?.funnel.reduce((s, r) => s + r.venda, 0) ?? 0;
  const totalLeads = data?.totalLeads ?? 0;
  const taxaGeral = totalLeads > 0 ? conversionRate(totalVenda, totalLeads) : 0;

  const aggregatedFunnel = useMemo(() => {
    if (!data?.funnel.length) return [];
    const rows = data.funnel;
    const groupKey = (r: FunnelRow) => {
      const parts: string[] = [];
      if (visibleCols.has("campaign")) parts.push(r.campaignId);
      if (visibleCols.has("adset")) parts.push(r.adsetId);
      if (visibleCols.has("ad")) parts.push(r.adId);
      return parts.length ? parts.join("|") : r.campaignId + "|" + r.adsetId + "|" + r.adId;
    };
    const map = new Map<string, FunnelRow>();
    for (const r of rows) {
      const key = groupKey(r);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...r });
      } else {
        existing.leads += r.leads;
        existing.sql += r.sql;
        existing.venda += r.venda;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.venda - a.venda) || (b.sql - a.sql) || (b.leads - a.leads)
    );
  }, [data?.funnel, visibleCols]);

  const maxLeads = aggregatedFunnel.length ? Math.max(...aggregatedFunnel.map((r) => r.leads), 1) : 1;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors bg-grain">
      <div className="relative p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
            Funil por campanha
          </h1>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all"
          >
            Voltar à home
          </Link>
        </div>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Filtros e exportação</CardTitle>
            <CardDescription>
              Defina o período e exporte os dados em CSV, TSV ou importe no Google Sheets.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="from">De</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Até</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button type="button" onClick={load} variant="default" className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90">
              Filtrar
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--muted-foreground)]">Exportar:</span>
              <a
                href={`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-all"
              >
                CSV
              </a>
              <a
                href={`/api/export?format=tsv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-all"
              >
                TSV
              </a>
              <span className="relative">
                <a
                  href={`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
                  download
                  onClick={() => setSheetsHint(true)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-all"
                >
                  Google Sheets
                </a>
                {sheetsHint && (
                  <Card className="absolute left-0 top-full mt-2 z-10 w-72 shadow-xl rounded-2xl border-[var(--border)]">
                    <CardContent className="p-4 text-xs text-[var(--muted-foreground)]">
                      CSV baixado. No Google Sheets: Arquivo → Importar → Fazer upload do arquivo.
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="mt-2 h-auto p-0 text-[var(--accent)]"
                        onClick={() => setSheetsHint(false)}
                      >
                        Fechar
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card className="rounded-2xl border-[var(--border)]">
            <CardContent className="p-12 text-center text-[var(--muted-foreground)]">
              Carregando…
            </CardContent>
          </Card>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Leads", value: totalLeads, accent: false },
                { label: "SQL", value: totalSql, accent: false },
                { label: "Venda", value: totalVenda, accent: true },
                { label: "Taxa de conversão (Lead → Venda)", value: `${taxaGeral}%`, accent: false },
              ].map((item, i) => (
                <Card key={item.label} className="rounded-2xl border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{item.label}</CardDescription>
                    <CardTitle className={`text-2xl ${item.accent ? "text-[var(--accent)]" : ""}`}>{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {aggregatedFunnel.length > 0 && (
              <Card className="rounded-2xl border-[var(--border)] shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg">Funil por campanha (Leads → SQL → Venda)</CardTitle>
                  <CardDescription>Barras proporcionais aos totais</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {aggregatedFunnel.slice(0, 10).map((row, idx) => (
                    <div
                      key={[row.campaignId, visibleCols.has("adset") ? row.adsetId : "", visibleCols.has("ad") ? row.adId : ""].filter(Boolean).join("-") || `row-${idx}`}
                      className="flex items-center gap-3"
                    >
                      <span className="w-40 text-[var(--muted-foreground)] text-sm truncate shrink-0" title={row.campaignName}>
                        {row.campaignName}
                      </span>
                      <div className="flex-1 flex gap-0.5 h-8 min-w-0">
                        <div
                          className="bg-zinc-500 dark:bg-zinc-600 rounded-l flex items-center justify-end pr-1 text-xs text-white shrink-0"
                          style={{ width: `${(row.leads / maxLeads) * 120}px`, minWidth: row.leads ? "24px" : "0" }}
                          title={`Leads: ${row.leads}`}
                        >
                          {row.leads > 0 && row.leads}
                        </div>
                        <div
                          className="bg-amber-500/90 dark:bg-amber-600/80 flex items-center justify-end pr-1 text-xs text-white shrink-0"
                          style={{ width: `${(row.sql / maxLeads) * 120}px`, minWidth: row.sql ? "24px" : "0" }}
                          title={`SQL: ${row.sql}`}
                        >
                          {row.sql > 0 && row.sql}
                        </div>
                        <div
                          className="bg-[var(--accent)] rounded-r flex items-center justify-end pr-1 text-xs text-[var(--accent-foreground)] shrink-0"
                          style={{ width: `${(row.venda / maxLeads) * 120}px`, minWidth: row.venda ? "24px" : "0" }}
                          title={`Venda: ${row.venda}`}
                        >
                          {row.venda > 0 && row.venda}
                        </div>
                      </div>
                      <span className="text-[var(--muted-foreground)] text-sm w-14 shrink-0 text-right">
                        {conversionRate(row.venda, row.leads)}%
                      </span>
                    </div>
                  ))}
                  <div className="flex gap-6 pt-2 text-xs text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-zinc-500 dark:bg-zinc-600" /> Leads</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/90 dark:bg-amber-600/80" /> SQL</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--accent)]" /> Venda</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-2xl border-[var(--border)] shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">Colunas visíveis</CardTitle>
                <CardDescription>Marque ou desmarque para agrupar a tabela</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                {COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer"
                  >
                    <Checkbox
                      checked={visibleCols.has(col.id)}
                      onCheckedChange={() => toggleCol(col.id)}
                    />
                    {col.label}
                  </label>
                ))}
              </CardContent>
            </Card>

            <p className="text-sm text-[var(--muted-foreground)]">
              Total de leads no período: {data.totalLeads}
              {data.from && data.to && ` (${data.from} a ${data.to})`}
            </p>

            <Card className="rounded-2xl border-[var(--border)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--border)] bg-[var(--muted)]/50 hover:bg-[var(--muted)]/50">
                      {visibleCols.has("campaign") && <TableHead>Campanha</TableHead>}
                      {visibleCols.has("adset") && <TableHead>Conjunto de anúncios</TableHead>}
                      {visibleCols.has("ad") && <TableHead>Anúncio</TableHead>}
                      {visibleCols.has("leads") && <TableHead className="text-right">Leads</TableHead>}
                      {visibleCols.has("sql") && <TableHead className="text-right">SQL</TableHead>}
                      {visibleCols.has("venda") && <TableHead className="text-right">Venda</TableHead>}
                      {visibleCols.has("conversionRate") && <TableHead className="text-right">Taxa conv.</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedFunnel.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleCols.size || 1} className="h-24 text-center text-[var(--muted-foreground)]">
                          Nenhum dado no período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      aggregatedFunnel.map((row, idx) => (
                        <TableRow
                          key={[row.campaignId, visibleCols.has("adset") ? row.adsetId : "", visibleCols.has("ad") ? row.adId : ""].filter(Boolean).join("-") || `row-${idx}`}
                        >
                          {visibleCols.has("campaign") && <TableCell className="font-medium">{row.campaignName}</TableCell>}
                          {visibleCols.has("adset") && <TableCell className="text-[var(--muted-foreground)]">{row.adsetName}</TableCell>}
                          {visibleCols.has("ad") && <TableCell className="text-[var(--muted-foreground)]">{row.adName}</TableCell>}
                          {visibleCols.has("leads") && <TableCell className="text-right text-[var(--muted-foreground)]">{row.leads}</TableCell>}
                          {visibleCols.has("sql") && <TableCell className="text-right text-[var(--muted-foreground)]">{row.sql}</TableCell>}
                          {visibleCols.has("venda") && <TableCell className="text-right font-medium text-[var(--accent)]">{row.venda}</TableCell>}
                          {visibleCols.has("conversionRate") && (
                            <TableCell className="text-right text-[var(--muted-foreground)]">{conversionRate(row.venda, row.leads)}%</TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
