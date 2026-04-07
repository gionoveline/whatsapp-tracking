"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

type LoadState = {
  markers: string[];
  defaults: string[];
  customized: boolean;
};

export function DeskSqlTagMarkersForm({ partnerId }: { partnerId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [customized, setCustomized] = useState(false);
  const [textarea, setTextarea] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await authFetch("/api/settings/desk-sql-tag-markers", { method: "GET", partnerId });
    const data = (await res.json().catch(() => ({}))) as LoadState & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Nao foi possivel carregar os marcadores.");
      setLoading(false);
      return;
    }
    setDefaults(data.defaults ?? []);
    setCustomized(Boolean(data.customized));
    const lines = (data.markers ?? []).join("\n");
    setTextarea(lines);
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const lines = textarea
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await authFetch("/api/settings/desk-sql-tag-markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ markers: lines }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      markers?: string[];
      customized?: boolean;
    };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao salvar.");
      return;
    }
    if (data.markers) {
      setTextarea(data.markers.join("\n"));
    }
    setCustomized(Boolean(data.customized));
  };

  const restoreDefaults = () => {
    setTextarea(defaults.join("\n"));
  };

  const clearToDefault = async () => {
    setTextarea("");
    setSaving(true);
    setError(null);
    const res = await authFetch("/api/settings/desk-sql-tag-markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ markers: [] }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; markers?: string[] };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Falha ao restaurar padrao.");
      return;
    }
    if (data.markers) {
      setTextarea(data.markers.join("\n"));
    }
    setCustomized(false);
  };

  return (
    <Card className="rounded-2xl border border-[var(--border)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Marcadores de SQL (Octadesk)</CardTitle>
        <CardDescription>
          Uma frase por linha. Se o texto do ticket (tags, campos customizados coletados pelo backend){" "}
          <strong>contiver</strong> a frase, ignorando maiusculas e acentos, o lead pode ser gravado como{" "}
          <code className="text-xs font-mono">sql</code> no funil (quando o parse CTWA for valido). Webhook de lead e
          importacao de amostra usam esta lista.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="desk-sql-markers">Frases marcadoras</Label>
              <textarea
                id="desk-sql-markers"
                className={cn(
                  "flex min-h-[140px] w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 transition-colors"
                )}
                value={textarea}
                onChange={(e) => setTextarea(e.target.value)}
                placeholder={"Oportunidade criada\nOptou por falar com consultor"}
                spellCheck={false}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                {customized
                  ? "Lista customizada para esta empresa."
                  : "Usando padrao do sistema (abaixo). Salvar copia explicitamente para customizar."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={restoreDefaults}>
                Preencher com padrao
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void clearToDefault()}>
                Remover customizacao (voltar ao padrao)
              </Button>
            </div>
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/20 p-3 text-xs text-[var(--muted-foreground)]">
              <p className="font-medium text-[var(--foreground)] mb-1">Padrao atual do sistema</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {defaults.map((d) => (
                  <li key={d} className="font-mono">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
