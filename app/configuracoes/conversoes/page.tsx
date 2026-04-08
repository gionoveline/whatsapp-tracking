"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import { useRequiredPartner } from "@/lib/use-required-partner";

type MappingItem = { enabled: boolean; event_name: string | null };
type Mapping = { lead: MappingItem; sql: MappingItem; venda: MappingItem };

const OUR_EVENT_LABELS: Record<keyof Mapping, string> = {
  lead: "Lead (conversa iniciada)",
  sql: "SQL",
  venda: "Venda",
};

export default function ConversoesPage() {
  const { partnerId, error: partnerError, isLoading: isPartnerLoading } = useRequiredPartner();
  const [capiWabaId, setCapiWabaId] = useState("");
  const [capiDatasetId, setCapiDatasetId] = useState("");
  const [capiPartnerAgent, setCapiPartnerAgent] = useState("");
  const [capiMapping, setCapiMapping] = useState<Mapping>({
    lead: { enabled: false, event_name: null },
    sql: { enabled: false, event_name: null },
    venda: { enabled: false, event_name: null },
  });
  const [capiEventNames, setCapiEventNames] = useState<string[]>([]);
  const [capiStatus, setCapiStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [capiMessage, setCapiMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!partnerId) {
        return;
      }
      const res = await authFetch("/api/settings/meta-conversions", { partnerId });
      const data = await res.json().catch(() => ({}));
      setCapiWabaId(data.waba_id ?? "");
      setCapiDatasetId(data.dataset_id ?? "");
      setCapiPartnerAgent(data.partner_agent ?? "");
      if (data.mapping) setCapiMapping(data.mapping);
      setCapiEventNames(data.event_names ?? []);
    };
    void load();
  }, [partnerId]);

  const handleCapiMappingChange = (key: keyof Mapping, value: string) => {
    const option = value === "" ? null : value;
    setCapiMapping((prev) => ({
      ...prev,
      [key]: { enabled: Boolean(option), event_name: option },
    }));
  };

  const handleCapiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCapiStatus("loading");
    setCapiMessage("");
    const res = await authFetch("/api/settings/meta-conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({
        waba_id: capiWabaId.trim(),
        dataset_id: capiDatasetId.trim(),
        partner_agent: capiPartnerAgent.trim() || undefined,
        mapping: capiMapping,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCapiStatus("success");
      setCapiMessage("Configuração de conversões salva.");
    } else {
      setCapiStatus("error");
      setCapiMessage(data.error || "Erro ao salvar.");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
            Conversões para Meta
          </h1>
          <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Beta
          </span>
        </div>
        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>}

        <p className="text-sm text-[var(--muted-foreground)]">
          Quando um evento ocorrer no nosso app (lead, SQL ou venda), você pode enviar um evento correspondente para a Meta. Configure abaixo qual nome de evento da Meta deve ser enviado em cada caso. Requer WABA ID e Dataset ID (obtidos na integração Conversions API for Business Messaging).
        </p>

        <Card className="rounded-2xl border-[var(--border)] bg-[var(--muted)]/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Documentação</CardTitle>
            <CardDescription>Links oficiais da Meta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="list-disc list-inside space-y-0.5 text-sm">
              <li>
                <a href="https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">Conversions API for Business Messaging</a>
              </li>
              <li>
                <a href="https://developers.facebook.com/docs/marketing-api/fmp-tmp-guides/capi-business-messaging-guidebooks/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">Guidebooks (WhatsApp, Messenger, Instagram)</a>
              </li>
            </ul>
            <p className="text-xs text-[var(--muted-foreground)] pt-1">
              As conversões vão para o <strong className="text-[var(--foreground)]">dataset</strong> da integração &quot;Conversions API for Business Messaging&quot; (WhatsApp), não para um Pixel.
            </p>
          </CardContent>
        </Card>

        <form onSubmit={handleCapiSubmit} className="space-y-6">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base">Credenciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="waba">WhatsApp Business Account ID (WABA ID)</Label>
                <Input
                  id="waba"
                  type="text"
                  value={capiWabaId}
                  onChange={(e) => setCapiWabaId(e.target.value)}
                  className="font-mono"
                  placeholder="ID da conta WhatsApp Business"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset">Dataset ID (Pixel)</Label>
                <Input
                  id="dataset"
                  type="text"
                  value={capiDatasetId}
                  onChange={(e) => setCapiDatasetId(e.target.value)}
                  className="font-mono"
                  placeholder="ID do dataset da integração WhatsApp"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Valor da integração &quot;Conversions API for Business Messaging&quot; no Meta — Gerenciador de Eventos.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner">Partner agent (opcional)</Label>
                <Input
                  id="partner"
                  type="text"
                  value={capiPartnerAgent}
                  onChange={(e) => setCapiPartnerAgent(e.target.value)}
                  placeholder="Nome do parceiro para a Meta"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-[var(--border)] shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="font-display text-base">Mapeamento de eventos</CardTitle>
              <CardDescription>Quando receber no app → enviar para Meta como</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="text-left p-3 text-[var(--muted-foreground)] font-medium">Quando receber no app</th>
                      <th className="text-left p-3 text-[var(--muted-foreground)] font-medium">Enviar para Meta como</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(OUR_EVENT_LABELS) as Array<keyof Mapping>).map((key) => (
                      <tr key={key} className="border-b border-[var(--border)] last:border-0">
                        <td className="p-3 text-[var(--foreground)]">{OUR_EVENT_LABELS[key]}</td>
                        <td className="p-3">
                          <select
                            value={capiMapping[key]?.event_name ?? ""}
                            onChange={(e) => handleCapiMappingChange(key, e.target.value)}
                            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] focus:ring-2 focus:ring-[var(--accent)]/50 focus:border-[var(--accent)]"
                          >
                            <option value="">Não enviar</option>
                            {capiEventNames.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={capiStatus === "loading"}
            className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
          >
            {capiStatus === "loading" ? "Salvando…" : "Salvar conversões para Meta"}
          </Button>
          {capiMessage && (
            <p className={`text-sm ${capiStatus === "success" ? "text-[var(--accent)]" : "text-red-600 dark:text-red-400"}`}>
              {capiMessage}
            </p>
          )}
        </form>

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">← Conectar Meta (token)</Link>
          <span>·</span>
          <Link href="/" className="text-[var(--accent)] hover:underline underline-offset-2">Início</Link>
        </p>
      </div>
    </main>
  );
}
