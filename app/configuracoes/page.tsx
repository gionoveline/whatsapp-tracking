"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ConfiguracoesPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings/meta-token")
      .then((r) => r.json())
      .then((data) => setConfigured(data.configured === true))
      .catch(() => setConfigured(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const res = await fetch("/api/settings/meta-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus("success");
      setConfigured(true);
      setToken("");
      setMessage("Token Meta salvo com sucesso.");
    } else {
      setStatus("error");
      setMessage(data.error || "Erro ao salvar.");
    }
  };

  return (
    <main className="p-8 max-w-2xl mx-auto min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
        Conectar Meta
      </h1>

      <section className="mb-10">
        <h2 className="text-lg text-zinc-700 dark:text-zinc-300 mb-2">Token da Marketing API</h2>
        <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-4">
          O token é usado para enriquecer os leads com nome da campanha, conjunto de anúncios e anúncio. Use um token com permissão <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-xs">ads_read</code> (e <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-xs">whatsapp_business_manage_events</code> se for usar conversões).
        </p>
        {configured !== null && (
          <p className="text-sm mb-4">
            Status:{" "}
            <span className={configured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
              {configured ? "Configurado" : "Não configurado"}
            </span>
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-zinc-600 dark:text-zinc-400 text-sm">Token de acesso Meta</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
              placeholder="Cole o token da Marketing API"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition disabled:opacity-50"
          >
            {status === "loading" ? "Salvando…" : "Salvar token"}
          </button>
        </form>
        {message && (
          <p className={`mt-2 text-sm ${status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {message}
          </p>
        )}
      </section>

      <section className="mb-10 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/30">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg text-zinc-700 dark:text-zinc-300">Envio de conversões para a Meta</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">Beta</span>
        </div>
        <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-3">
          Envie eventos Lead, SQL e Venda para a Meta para otimização das campanhas (Conversions API for Business Messaging).
        </p>
        <Link
          href="/configuracoes/conversoes"
          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300"
        >
          Configurar conversões →
        </Link>
      </section>

      <p className="text-zinc-500 text-sm">
        <Link href="/" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">← Voltar ao início</Link>
      </p>
    </main>
  );
}
