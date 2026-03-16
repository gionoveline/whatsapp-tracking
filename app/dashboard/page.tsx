"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
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
import {
  ChartContainer,
  type ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";

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
  timeSeries?: {
    date: string;
    leads: number;
    sql: number;
    venda: number;
    conversionRate: number;
  }[];
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
  const [viewMode, setViewMode] = useState<"funnel" | "timeseries">("funnel");
  const [exportOpen, setExportOpen] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
  const [toCalendarOpen, setToCalendarOpen] = useState(false);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);

  const fromRef = useRef<HTMLDivElement | null>(null);
  const toRef = useRef<HTMLDivElement | null>(null);
  const campaignRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (fromRef.current && !fromRef.current.contains(target)) {
        setFromCalendarOpen(false);
      }
      if (toRef.current && !toRef.current.contains(target)) {
        setToCalendarOpen(false);
      }
      if (campaignRef.current && !campaignRef.current.contains(target)) {
        setCampaignDropdownOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const timeSeries = data?.timeSeries ?? [];
  const maxDailyCount = timeSeries.length
    ? Math.max(
        ...timeSeries.map((d) => Math.max(d.leads, d.sql, d.venda)),
        1
      )
    : 1;
  const maxDailyRate = timeSeries.length ? Math.max(...timeSeries.map((d) => d.conversionRate), 1) : 1;

  const chartConfig: ChartConfig = {
    leads: { label: "Leads", color: "#6b7280" },
    sql: { label: "SQL", color: "#f59e0b" },
    venda: { label: "Venda", color: "#16a34a" },
    rate: { label: "Taxa (%)", color: "#0ea5e9" },
  };

  const filteredFunnel =
    campaignFilter.length > 0
      ? aggregatedFunnel.filter((row) => campaignFilter.includes(row.campaignName))
      : aggregatedFunnel;

  const funnelChartData = filteredFunnel.slice(0, 10).map((row) => ({
    name: row.campaignName,
    leads: row.leads,
    sql: row.sql,
    venda: row.venda,
  }));

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Filtros e exportação</CardTitle>
                <CardDescription>
                  Defina o período e exporte os dados em CSV, TSV ou importe no Google Sheets.
                </CardDescription>
              </div>
              <div className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("funnel")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    viewMode === "funnel"
                      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Funil por campanha
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeseries")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    viewMode === "timeseries"
                      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Série temporal (dia)
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2" ref={fromRef}>
              <Label>Data inicial</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal text-[var(--foreground)] flex items-center justify-between min-w-[160px]"
                  onClick={() => setFromCalendarOpen((v) => !v)}
                >
                  <span className="text-[var(--muted-foreground)]">
                    {from || "Escolher data"}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">Alterar</span>
                </Button>
                {fromCalendarOpen && (
                  <div className="absolute z-30 mt-2">
                    <Card className="shadow-xl rounded-2xl border-[var(--border)] bg-[var(--card)]">
                      <CardContent className="p-3">
                        <Calendar
                          mode="single"
                          selected={from ? new Date(from) : undefined}
                          onSelect={(date) => {
                            if (!date) {
                              setFrom("");
                              return;
                            }
                            setFrom(date.toISOString().slice(0, 10));
                            setFromCalendarOpen(false);
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2" ref={toRef}>
              <Label>Data final</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal text-[var(--foreground)] flex items-center justify-between min-w-[160px]"
                  onClick={() => setToCalendarOpen((v) => !v)}
                >
                  <span className="text-[var(--muted-foreground)]">
                    {to || "Escolher data"}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">Alterar</span>
                </Button>
                {toCalendarOpen && (
                  <div className="absolute z-30 mt-2">
                    <Card className="shadow-xl rounded-2xl border-[var(--border)] bg-[var(--card)]">
                      <CardContent className="p-3">
                        <Calendar
                          mode="single"
                          selected={to ? new Date(to) : undefined}
                          onSelect={(date) => {
                            if (!date) {
                              setTo("");
                              return;
                            }
                            setTo(date.toISOString().slice(0, 10));
                            setToCalendarOpen(false);
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 min-w-[180px]" ref={campaignRef}>
              <Label>Campanhas</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal text-[var(--foreground)] flex items-center justify-between"
                  onClick={() => setCampaignDropdownOpen((v) => !v)}
                >
                  <span className="truncate text-[var(--muted-foreground)]">
                    {campaignFilter.length === 0
                      ? "Todas as campanhas"
                      : `${campaignFilter.length} selecionada(s)`}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">Filtrar</span>
                </Button>
                {campaignDropdownOpen && (
                  <Card className="absolute z-30 mt-2 w-64 shadow-xl rounded-2xl border-[var(--border)] bg-[var(--card)]">
                    <CardContent className="p-3 space-y-2 max-h-60 overflow-y-auto">
                      {Array.from(new Set((data?.funnel ?? []).map((r) => r.campaignName))).map(
                        (name) => {
                          const checked = campaignFilter.includes(name);
                          return (
                            <label
                              key={name}
                              className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  setCampaignFilter((prev) =>
                                    prev.includes(name)
                                      ? prev.filter((n) => n !== name)
                                      : [...prev, name]
                                  );
                                }}
                              />
                              <span className="truncate">{name}</span>
                            </label>
                          );
                        }
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
            <Button type="button" onClick={load} variant="default" className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90">
              Filtrar
            </Button>
            <div className="flex flex-wrap items-center gap-2" ref={exportRef}>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-all"
                  onClick={() => setExportOpen((v) => !v)}
                >
                  <Download className="h-4 w-4" />
                  <span>Exportar</span>
                </Button>
                {exportOpen && (
                  <Card className="absolute left-0 top-full mt-2 z-20 w-40 shadow-xl rounded-2xl border-[var(--border)]">
                    <CardContent className="p-1 text-sm text-[var(--foreground)]">
                      <button
                        type="button"
                        className="flex w-full items-center rounded-lg px-3 py-1.5 hover:bg-[var(--muted)]/60 text-left"
                        onClick={() => {
                          window.location.href = `/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
                          setExportOpen(false);
                        }}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center rounded-lg px-3 py-1.5 hover:bg-[var(--muted)]/60 text-left"
                        onClick={() => {
                          window.location.href = `/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
                          setSheetsHint(true);
                          setExportOpen(false);
                        }}
                      >
                        Google Sheets
                      </button>
                    </CardContent>
                  </Card>
                )}
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
              </div>
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

            {viewMode === "funnel" && aggregatedFunnel.length > 0 && (
              <Card className="rounded-2xl border-[var(--border)] shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg">
                    Funil por campanha (Leads → SQL → Venda)
                  </CardTitle>
                  <div className="text-sm text-[var(--muted-foreground)] flex flex-wrap items-center gap-4">
                    <span>Barras proporcionais aos totais.</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-zinc-500" /> Leads
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-500" /> SQL
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-emerald-600" /> Venda
                      </span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
                    <BarChart
                      data={funnelChartData}
                      layout="vertical"
                      margin={{ left: 80, right: 24, top: 16, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={200}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="leads"
                        name="Leads"
                        stackId="a"
                        fill="var(--color-leads)"
                        radius={[4, 0, 0, 4]}
                      />
                      <Bar
                        dataKey="sql"
                        name="SQL"
                        stackId="a"
                        fill="var(--color-sql)"
                      />
                      <Bar
                        dataKey="venda"
                        name="Venda"
                        stackId="a"
                        fill="var(--color-venda)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {viewMode === "timeseries" && timeSeries.length > 0 && (
              <Card className="rounded-2xl border-[var(--border)] shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg">
                    Série temporal (Leads, SQL, Venda e taxa)
                  </CardTitle>
                  <div className="text-sm text-[var(--muted-foreground)] flex flex-wrap items-center gap-4">
                    <span>
                      Barras diárias por status e linha com taxa de conversão (Lead → Venda).
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-zinc-500" /> Leads
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-500" /> SQL
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-emerald-600" /> Venda
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-[2px] rounded-full bg-sky-500" /> Taxa (%)
                      </span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
                    <BarChart
                      data={timeSeries.map((d) => ({
                        ...d,
                        rate: d.conversionRate,
                      }))}
                      margin={{ left: 32, right: 32, top: 16, bottom: 24 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => {
                          const str = String(value);
                          const [, month, day] = str.split("-");
                          const monthMap: Record<string, string> = {
                            "01": "jan",
                            "02": "fev",
                            "03": "mar",
                            "04": "abr",
                            "05": "mai",
                            "06": "jun",
                            "07": "jul",
                            "08": "ago",
                            "09": "set",
                            "10": "out",
                            "11": "nov",
                            "12": "dez",
                          };
                          const abbr = monthMap[month] ?? month;
                          return `${day}/${abbr}`;
                        }}
                      />
                      <YAxis
                        yAxisId="left"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(v) => String(v)}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        yAxisId="left"
                        dataKey="leads"
                        name="Leads"
                        fill="var(--color-leads)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="sql"
                        name="SQL"
                        fill="var(--color-sql)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="venda"
                        name="Venda"
                        fill="var(--color-venda)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="conversionRate"
                        name="Taxa (%)"
                        stroke="var(--color-rate)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 4 }}
                      />
                    </BarChart>
                  </ChartContainer>
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
