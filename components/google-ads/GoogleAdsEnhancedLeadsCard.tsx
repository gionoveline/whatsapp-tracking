"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/client-auth";

type Settings = {
  enabled: boolean;
  shadowMode: boolean;
  usePhone: boolean;
  useEmail: boolean;
};

type Stats7d = {
  total: number;
  wouldSend: number;
  withPhone: number;
  withEmail: number;
  withBoth: number;
};

type Props = {
  partnerId: string;
};

export function GoogleAdsEnhancedLeadsCard({ partnerId }: Props) {
  const [settings, setSettings] = useState<Settings>({
    enabled: false,
    shadowMode: true,
    usePhone: true,
    useEmail: true,
  });
  const [stats7d, setStats7d] = useState<Stats7d | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!partnerId) return;
    void (async () => {
      const res = await authFetch("/api/settings/google-ads-enhanced-leads", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (data.settings) setSettings(data.settings);
      if (data.stats7d) setStats7d(data.stats7d);
    })();
  }, [partnerId]);

  const save = async () => {
    setStatus("loading");
    setMessage("");
    const res = await authFetch("/api/settings/google-ads-enhanced-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setMessage(data.error ?? "Falha ao salvar.");
      return;
    }
    setStatus("success");
    setMessage("Configuração salva.");
    const refresh = await authFetch("/api/settings/google-ads-enhanced-leads", { partnerId });
    const refreshed = await refresh.json().catch(() => ({}));
    if (refreshed.stats7d) setStats7d(refreshed.stats7d);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enhanced Conversions for Leads (shadow)</CardTitle>
        <CardDescription>
          Mede SQL Google LP sem click id que poderiam ser enviados com telefone/e-mail hasheados. Não chama a API do
          Google enquanto shadow estiver ativo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
          />
          Ativar avaliação EC for Leads
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.shadowMode}
            onChange={(e) => setSettings((s) => ({ ...s, shadowMode: e.target.checked }))}
          />
          Shadow mode (não envia ao Google)
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.usePhone}
              onChange={(e) => setSettings((s) => ({ ...s, usePhone: e.target.checked }))}
            />
            Usar telefone
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.useEmail}
              onChange={(e) => setSettings((s) => ({ ...s, useEmail: e.target.checked }))}
            />
            Usar e-mail
          </label>
        </div>

        {stats7d && (
          <div className="rounded-xl border border-[var(--border)] p-3 text-sm space-y-1">
            <p className="font-medium text-[var(--foreground)]">Shadow SQL (7 dias)</p>
            <p className="text-[var(--muted-foreground)]">Eventos: {stats7d.total}</p>
            <p className="text-[var(--muted-foreground)]">Elegíveis (would send): {stats7d.wouldSend}</p>
            <p className="text-[var(--muted-foreground)]">Com telefone: {stats7d.withPhone}</p>
            <p className="text-[var(--muted-foreground)]">Com e-mail: {stats7d.withEmail}</p>
            <p className="text-[var(--muted-foreground)]">Com ambos: {stats7d.withBoth}</p>
          </div>
        )}

        <Button type="button" onClick={() => void save()} disabled={status === "loading"}>
          {status === "loading" ? "Salvando…" : "Salvar"}
        </Button>
        {message ? (
          <p
            className={`text-sm ${status === "success" ? "text-[var(--accent)]" : status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
          >
            {message}
          </p>
        ) : null}
        <p className="text-xs text-[var(--muted-foreground)]">
          Próximo passo: desligar shadow e habilitar EC for Leads na conta Google antes do envio real.
        </p>
      </CardContent>
    </Card>
  );
}
