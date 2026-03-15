"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MappingItem = { enabled: boolean; event_name: string | null };
type Mapping = { lead: MappingItem; sql: MappingItem; venda: MappingItem };

const OUR_EVENT_LABELS: Record<keyof Mapping, string> = {
  lead: "Lead (conversa iniciada)",
  sql: "SQL",
  venda: "Venda",
};

export default function ConversoesPage() {
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
    fetch("/api/settings/meta-conversions")
      .then((r) => r.json())
      .then((data) => {
        setCapiWabaId(data.waba_id ?? "");
        setCapiDatasetId(data.dataset_id ?? "");
        setCapiPartnerAgent(data.partner_agent ?? "");
        if (data.mapping) setCapiMapping(data.mapping);
        setCapiEventNames(data.event_names ?? []);
      })
      .catch(() => {});
  }, []);

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
    const res = await fetch("/api/settings/meta-conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    <main className="p-8 max-w-2xl mx-auto min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Conversões para Meta
        </h1>
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
          Beta
        </span>
      </div>

      <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
        Quando um evento ocorrer no nosso app (lead, SQL ou venda), você pode enviar um evento correspondente para a Meta. Configure abaixo qual nome de evento da Meta deve ser enviado em cada caso. Requer WABA ID e Dataset ID (obtidos na integração Conversions API for Business Messaging).
      </p>
      <div className="mb-4 p-3 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-400">
        <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Documentação</p>
        <ul className="list-disc list-inside space-y-0.5 mb-2">
          <li>
            <a href="https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline">Conversions API for Business Messaging</a>
          </li>
          <li>
            <a href="https://developers.facebook.com/docs/marketing-api/fmp-tmp-guides/capi-business-messaging-guidebooks/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline">Guidebooks (WhatsApp, Messenger, Instagram)</a>
          </li>
        </ul>
        <p className="text-zinc-500 dark:text-zinc-500 text-xs">
          As conversões vão para o <strong className="text-zinc-600 dark:text-zinc-400">dataset</strong> da integração &quot;Conversions API for Business Messaging&quot; (WhatsApp), não para um Pixel.
        </p>
      </div>

      <form onSubmit={handleCapiSubmit} className="space-y-4">
        <label className="block">
          <span className="text-zinc-600 dark:text-zinc-400 text-sm">WhatsApp Business Account ID (WABA ID)</span>
          <input
            type="text"
            value={capiWabaId}
            onChange={(e) => setCapiWabaId(e.target.value)}
            className="mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
            placeholder="ID da conta WhatsApp Business"
          />
        </label>
        <label className="block">
          <span className="text-zinc-600 dark:text-zinc-400 text-sm">Dataset ID</span>
          <input
            type="text"
            value={capiDatasetId}
            onChange={(e) => setCapiDatasetId(e.target.value)}
            className="mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
            placeholder="ID do dataset da integração WhatsApp"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Valor da integração &quot;Conversions API for Business Messaging&quot; no Meta — Gerenciador de Eventos.
          </p>
        </label>
        <label className="block">
          <span className="text-zinc-600 dark:text-zinc-400 text-sm">Partner agent (opcional)</span>
          <input
            type="text"
            value={capiPartnerAgent}
            onChange={(e) => setCapiPartnerAgent(e.target.value)}
            className="mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100"
            placeholder="Nome do parceiro para a Meta"
          />
        </label>

        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
                <th className="text-left p-3 text-zinc-600 dark:text-zinc-400 font-medium">Quando receber no app</th>
                <th className="text-left p-3 text-zinc-600 dark:text-zinc-400 font-medium">Enviar para Meta como</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(OUR_EVENT_LABELS) as Array<keyof Mapping>).map((key) => (
                <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <td className="p-3 text-zinc-800 dark:text-zinc-200">{OUR_EVENT_LABELS[key]}</td>
                  <td className="p-3">
                    <select
                      value={capiMapping[key]?.event_name ?? ""}
                      onChange={(e) => handleCapiMappingChange(key, e.target.value)}
                      className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-900 dark:text-zinc-100"
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

        <button
          type="submit"
          disabled={capiStatus === "loading"}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition disabled:opacity-50"
        >
          {capiStatus === "loading" ? "Salvando…" : "Salvar conversões para Meta"}
        </button>
      </form>
      {capiMessage && (
        <p className={`mt-2 text-sm ${capiStatus === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {capiMessage}
        </p>
      )}

      <p className="text-zinc-500 text-sm mt-8">
        <Link href="/configuracoes" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">← Conectar Meta (token)</Link>
        {" · "}
        <Link href="/" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">Início</Link>
      </p>
    </main>
  );
}
