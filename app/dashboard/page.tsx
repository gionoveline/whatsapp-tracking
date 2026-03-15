"use client";

import { useEffect, useMemo, useState } from "react";

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

  /** Agrega linhas conforme colunas de dimensão visíveis: ao esconder Anúncio/Conjunto de anúncios, agrupa por campanha e soma métricas. */
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
    <main className="p-8 max-w-6xl mx-auto min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
        Funil por campanha
      </h1>

      <div className="flex flex-wrap gap-4 items-end mb-6">
        <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          De
          <input
            type="date"
            className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          Até
          <input
            type="date"
            className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded transition"
        >
          Filtrar
        </button>
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-zinc-500 dark:text-zinc-400 text-sm">Exportar:</span>
          <a
            href={`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
            className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded transition text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            CSV
          </a>
          <a
            href={`/api/export?format=tsv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
            className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded transition text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            TSV
          </a>
          <span className="relative">
            <a
              href={`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
              download
              onClick={() => setSheetsHint(true)}
              className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded transition text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              Google Sheets
            </a>
            {sheetsHint && (
              <span className="absolute left-0 top-full mt-1 z-10 w-64 p-2 text-xs rounded-lg bg-zinc-800 dark:bg-zinc-700 text-zinc-200 shadow-lg">
                CSV baixado. No Google Sheets: Arquivo → Importar → Fazer upload do arquivo.
                <button type="button" onClick={() => setSheetsHint(false)} className="block mt-1 text-emerald-400 hover:underline">Fechar</button>
              </span>
            )}
          </span>
        </span>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {loading && <p className="text-zinc-500">Carregando…</p>}

      {!loading && data && (
        <>
          {/* Métricas e taxa de conversão */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Leads</p>
              <p className="text-2xl font-semibold text-zinc-100">{totalLeads}</p>
            </div>
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">SQL</p>
              <p className="text-2xl font-semibold text-zinc-100">{totalSql}</p>
            </div>
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Venda</p>
              <p className="text-2xl font-semibold text-emerald-400">{totalVenda}</p>
            </div>
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Taxa de conversão (Lead → Venda)</p>
              <p className="text-2xl font-semibold text-zinc-100">{taxaGeral}%</p>
            </div>
          </div>

          {/* Gráfico do funil (barras) */}
          {aggregatedFunnel.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg text-zinc-300 mb-4">Funil por campanha (Leads → SQL → Venda)</h2>
              <div className="space-y-3">
                {aggregatedFunnel.slice(0, 10).map((row, idx) => (
                  <div key={[row.campaignId, visibleCols.has("adset") ? row.adsetId : "", visibleCols.has("ad") ? row.adId : ""].filter(Boolean).join("-") || `row-${idx}`} className="flex items-center gap-3">
                    <span className="w-40 text-zinc-400 text-sm truncate shrink-0" title={row.campaignName}>
                      {row.campaignName}
                    </span>
                    <div className="flex-1 flex gap-0.5 h-8 min-w-0">
                      <div
                        className="bg-zinc-600 rounded-l flex items-center justify-end pr-1 text-xs text-zinc-200 shrink-0"
                        style={{ width: `${(row.leads / maxLeads) * 120}px`, minWidth: row.leads ? "24px" : "0" }}
                        title={`Leads: ${row.leads}`}
                      >
                        {row.leads > 0 && row.leads}
                      </div>
                      <div
                        className="bg-amber-600/80 flex items-center justify-end pr-1 text-xs text-zinc-100 shrink-0"
                        style={{ width: `${(row.sql / maxLeads) * 120}px`, minWidth: row.sql ? "24px" : "0" }}
                        title={`SQL: ${row.sql}`}
                      >
                        {row.sql > 0 && row.sql}
                      </div>
                      <div
                        className="bg-emerald-600 rounded-r flex items-center justify-end pr-1 text-xs text-white shrink-0"
                        style={{ width: `${(row.venda / maxLeads) * 120}px`, minWidth: row.venda ? "24px" : "0" }}
                        title={`Venda: ${row.venda}`}
                      >
                        {row.venda > 0 && row.venda}
                      </div>
                    </div>
                    <span className="text-zinc-500 text-sm w-14 shrink-0 text-right">
                      {conversionRate(row.venda, row.leads)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-6 mt-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-zinc-600" /> Leads</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-600/80" /> SQL</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600" /> Venda</span>
              </div>
            </section>
          )}

          {/* Seletor de colunas */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-zinc-500 text-sm">Colunas visíveis:</span>
            {COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleCols.has(col.id)}
                  onChange={() => toggleCol(col.id)}
                  className="rounded border-zinc-600 bg-zinc-800 text-zinc-100"
                />
                {col.label}
              </label>
            ))}
          </div>

          <p className="text-zinc-500 text-sm mb-4">
            Total de leads no período: {data.totalLeads}
            {data.from && data.to && ` (${data.from} a ${data.to})`}
          </p>
          <div className="overflow-x-auto border border-zinc-700 rounded-lg">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/80">
                  {visibleCols.has("campaign") && <th className="p-3 text-zinc-400 font-medium">Campanha</th>}
                  {visibleCols.has("adset") && <th className="p-3 text-zinc-400 font-medium">Conjunto de anúncios</th>}
                  {visibleCols.has("ad") && <th className="p-3 text-zinc-400 font-medium">Anúncio</th>}
                  {visibleCols.has("leads") && <th className="p-3 text-zinc-400 font-medium text-right">Leads</th>}
                  {visibleCols.has("sql") && <th className="p-3 text-zinc-400 font-medium text-right">SQL</th>}
                  {visibleCols.has("venda") && <th className="p-3 text-zinc-400 font-medium text-right">Venda</th>}
                  {visibleCols.has("conversionRate") && <th className="p-3 text-zinc-400 font-medium text-right">Taxa conv.</th>}
                </tr>
              </thead>
              <tbody>
                {aggregatedFunnel.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.size || 1} className="p-4 text-zinc-500 text-center">
                      Nenhum dado no período.
                    </td>
                  </tr>
                ) : (
                  aggregatedFunnel.map((row, idx) => (
                    <tr
                      key={[row.campaignId, visibleCols.has("adset") ? row.adsetId : "", visibleCols.has("ad") ? row.adId : ""].filter(Boolean).join("-") || `row-${idx}`}
                      className="border-b border-zinc-800 hover:bg-zinc-800/40"
                    >
                      {visibleCols.has("campaign") && <td className="p-3 text-zinc-200">{row.campaignName}</td>}
                      {visibleCols.has("adset") && <td className="p-3 text-zinc-300">{row.adsetName}</td>}
                      {visibleCols.has("ad") && <td className="p-3 text-zinc-300">{row.adName}</td>}
                      {visibleCols.has("leads") && <td className="p-3 text-right text-zinc-300">{row.leads}</td>}
                      {visibleCols.has("sql") && <td className="p-3 text-right text-zinc-300">{row.sql}</td>}
                      {visibleCols.has("venda") && <td className="p-3 text-right text-zinc-100 font-medium">{row.venda}</td>}
                      {visibleCols.has("conversionRate") && (
                        <td className="p-3 text-right text-zinc-300">{conversionRate(row.venda, row.leads)}%</td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
