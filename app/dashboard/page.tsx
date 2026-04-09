"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { authFetch, getClientAuth } from "@/lib/client-auth";
import { isPlaceholderPartner } from "@/lib/partner-onboarding";

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
  const router = useRouter();
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
  const [campaignFilterInput, setCampaignFilterInput] = useState("");
  const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
  const [toCalendarOpen, setToCalendarOpen] = useState(false);
  const [activePartnerId, setActivePartnerId] = useState("");

  const fromRef = useRef<HTMLDivElement | null>(null);
  const toRef = useRef<HTMLDivElement | null>(null);
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
    const auth = await getClientAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    let partnerId = localStorage.getItem("active_partner_id") ?? "";
    if (!partnerId) {
      try {
        const sessionRes = await authFetch("/api/auth/session");
        if (!sessionRes.ok) {
          throw new Error(await sessionRes.text());
        }
        const sessionJson = (await sessionRes.json()) as {
          partners?: Array<{ id: string; name: string; slug?: string | null }>;
          needs_onboarding?: boolean;
        };
        const partners = Array.isArray(sessionJson.partners) ? sessionJson.partners : [];
        const needsOnboarding = sessionJson.needs_onboarding === true;

        if (needsOnboarding) {
          router.replace("/primeiro-acesso");
          return;
        }

        if (partners.length === 1) {
          partnerId = (partners.find((p) => !isPlaceholderPartner(p)) ?? partners[0]).id;
          localStorage.setItem("active_partner_id", partnerId);
        } else if (partners.length > 1) {
          setError("Selecione uma empresa no seletor no topo para carregar o dashboard.");
          setLoading(false);
          return;
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Nao foi possivel carregar as empresas disponiveis para sua conta."
        );
        setLoading(false);
        return;
      }
    }

    setActivePartnerId(partnerId);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await authFetch(`/api/funnel?${params}`, { partnerId });
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
    void load();
  }, []);

  useEffect(() => {
    const handlePartnerChanged = () => {
      void load();
    };
    window.addEventListener("partner-changed", handlePartnerChanged as EventListener);
    return () => {
      window.removeEventListener("partner-changed", handlePartnerChanged as EventListener);
    };
  }, [from, to]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (fromRef.current && !fromRef.current.contains(target)) {
        setFromCalendarOpen(false);
      }
      if (toRef.current && !toRef.current.contains(target)) {
        setToCalendarOpen(false);
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

  const timeSeries = data?.timeSeries ?? [];

  const chartConfig: ChartConfig = {
    leads: { label: "Leads", color: "#6b7280" },
    sql: { label: "SQL", color: "#f59e0b" },
    venda: { label: "Venda", color: "#16a34a" },
    rate: { label: "Taxa (%)", color: "#0ea5e9" },
  };

  const normalizedCampaignFilters = campaignFilter.map((term) => term.trim().toLowerCase());
  const filteredFunnel =
    normalizedCampaignFilters.length > 0
      ? aggregatedFunnel.filter((row) => {
          const campaignName = row.campaignName.toLowerCase();
          return normalizedCampaignFilters.every((term) => campaignName.includes(term));
        })
      : aggregatedFunnel;

  const funnelChartData = filteredFunnel.slice(0, 10).map((row) => ({
    name: row.campaignName,
    leads: row.leads,
    sql: row.sql,
    venda: row.venda,
  }));

  const addCampaignFilter = () => {
    const term = campaignFilterInput.trim();
    if (!term) return;
    setCampaignFilter((prev) => {
      const normalized = term.toLowerCase();
      if (prev.some((item) => item.toLowerCase() === normalized)) return prev;
      return [...prev, term];
    });
    setCampaignFilterInput("");
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors bg-grain">
      <div className="relative p-4 sm:p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--foreground)]">
            Funil por campanha
          </h1>
          <Link
            href="/"
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all"
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
              <div className="inline-flex w-full sm:w-auto items-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("funnel")}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-medium transition-colors ${
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
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-medium transition-colors ${
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
          <CardContent className="flex flex-wrap gap-4 items-start">
            <div className="space-y-2 w-full sm:w-auto" ref={fromRef}>
              <Label>Data inicial</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full sm:w-auto rounded-xl border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal text-[var(--foreground)] flex items-center justify-between min-w-0 sm:min-w-[160px]"
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
            <div className="space-y-2 w-full sm:w-auto" ref={toRef}>
              <Label>Data final</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full sm:w-auto rounded-xl border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal text-[var(--foreground)] flex items-center justify-between min-w-0 sm:min-w-[160px]"
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
            <div className="space-y-2 w-full sm:w-auto min-w-0 sm:min-w-[180px]">
              <Label>Campanhas</Label>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={campaignFilterInput}
                    onChange={(event) => setCampaignFilterInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addCampaignFilter();
                      }
                    }}
                    placeholder='Ex.: "remarketing"'
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] sm:min-w-[220px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={addCampaignFilter}
                  >
                    Adicionar
                  </Button>
                </div>
                {campaignFilter.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {campaignFilter.map((term) => (
                        <span
                          key={term}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 text-xs text-[var(--foreground)]"
                        >
                          contém: {term}
                          <button
                            type="button"
                            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            onClick={() =>
                              setCampaignFilter((prev) => prev.filter((item) => item !== term))
                            }
                            aria-label={`Remover filtro ${term}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-[var(--muted-foreground)]"
                      onClick={() => setCampaignFilter([])}
                    >
                      Limpar filtros
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Button
              type="button"
              onClick={load}
              variant="default"
              className="w-full sm:w-auto sm:mt-7 bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
            >
              Filtrar
            </Button>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:mt-7" ref={exportRef}>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-all"
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
                        onClick={async () => {
                          if (!activePartnerId) return;
                          const res = await authFetch(`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, {
                            partnerId: activePartnerId,
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "leads-export.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                          setExportOpen(false);
                        }}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center rounded-lg px-3 py-1.5 hover:bg-[var(--muted)]/60 text-left"
                        onClick={async () => {
                          if (!activePartnerId) return;
                          const res = await authFetch(`/api/export?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, {
                            partnerId: activePartnerId,
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "leads-export-google-sheets.csv";
                          a.click();
                          URL.revokeObjectURL(url);
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
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              {!activePartnerId && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="h-8" onClick={load}>
                    Tentar novamente
                  </Button>
                  <Link
                    href="/configuracoes"
                    className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]/50"
                  >
                    Ir para Configuracoes
                  </Link>
                </div>
              )}
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
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Leads", value: totalLeads, accent: false },
                { label: "SQL", value: totalSql, accent: false },
                { label: "Venda", value: totalVenda, accent: true },
                { label: "Taxa de conversão (Lead → Venda)", value: `${taxaGeral}%`, accent: false },
              ].map((item) => (
                <Card key={item.label} className="rounded-2xl border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2 px-4 sm:px-6">
                    <CardDescription className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{item.label}</CardDescription>
                    <CardTitle className={`text-xl sm:text-2xl ${item.accent ? "text-[var(--accent)]" : ""}`}>{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {viewMode === "funnel" && filteredFunnel.length > 0 && (
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
                <CardContent className="space-y-4 overflow-x-auto">
                  <ChartContainer config={chartConfig} className="min-h-[260px] w-full min-w-[560px] sm:min-w-0">
                    <BarChart
                      data={funnelChartData}
                      layout="vertical"
                      margin={{ left: 24, right: 16, top: 16, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          const name = String(value);
                          return name.length > 14 ? `${name.slice(0, 14)}...` : name;
                        }}
                        width={110}
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
                <CardContent className="space-y-4 overflow-x-auto">
                  <ChartContainer config={chartConfig} className="min-h-[260px] w-full min-w-[620px] sm:min-w-0">
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
                        minTickGap={24}
                        interval="preserveStartEnd"
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
                    {filteredFunnel.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleCols.size || 1} className="h-24 text-center text-[var(--muted-foreground)]">
                          Nenhum dado encontrado para os filtros atuais.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFunnel.map((row, idx) => (
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
