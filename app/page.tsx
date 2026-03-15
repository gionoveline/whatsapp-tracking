"use client";

import Link from "next/link";
import { useState } from "react";
import { MetaLogo } from "@/components/ui/MetaLogo";
import { OctaDeskLogo } from "@/components/ui/OctaDeskLogo";

const steps = [
  {
    num: 1,
    title: "Conecte sua conta Meta",
    desc: "Informe o token da Marketing API para enriquecer os leads com campanha, conjunto de anúncios e anúncio.",
    cta: { label: "Conectar Meta", href: "/configuracoes" },
  },
  {
    num: 2,
    title: "Configure os webhooks no seu atendimento",
    desc: "No sistema onde rodam as conversas (ex.: OctaDesk), envie conversas iniciadas, SQL e vendas para o nosso app.",
    cta: { label: "Ver URLs dos webhooks", href: "#webhooks" },
  },
  {
    num: 3,
    title: "Veja o funil e exporte",
    desc: "Acompanhe o funil no Dashboard. Exporte os dados para Excel, Power BI ou onde precisar.",
    cta: { label: "Abrir Dashboard", href: "/dashboard" },
  },
  {
    num: 4,
    title: "Envio de conversões para a Meta (Beta)",
    desc: "Envie eventos Lead, SQL e Venda para a Meta para otimização das campanhas.",
    cta: { label: "Configurar conversões", href: "/configuracoes/conversoes" },
    beta: true,
  },
];

export default function Home() {
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300 ease-in-out">
      {/* Hero */}
      <section className="relative border-b border-zinc-200 dark:border-zinc-800/80 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900/60 dark:to-zinc-950 px-6 pt-12 pb-16 sm:px-8 sm:pt-16 sm:pb-20 transition-colors duration-300 ease-in-out">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
            WhatsApp Tracking
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
            Atribuição de campanhas Click to WhatsApp (Meta)
          </p>
          <p className="mt-2 max-w-xl mx-auto text-sm text-zinc-500">
            Conecte o que acontece no WhatsApp — leads, SQL e vendas — às campanhas, conjuntos de anúncios e anúncios de origem.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/configuracoes"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
            >
              Configurações
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800/50 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section className="px-6 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white sm:text-2xl">
            Como começar
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Em poucos passos você conecta suas campanhas ao que acontece no WhatsApp.
          </p>
          <ol className="mt-8 space-y-6">
            {steps.map((step) => (
              <li
                key={step.num}
                className="relative flex gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-4 transition-colors duration-300 hover:border-zinc-300 dark:hover:border-zinc-700/80 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/60 sm:p-5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/50 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                  aria-hidden
                >
                  {step.num}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {step.num === 1 && (
                      <span className="flex h-6 shrink-0 items-center" aria-hidden>
                        <MetaLogo className="h-6 w-6 object-contain" />
                      </span>
                    )}
                    {step.num === 2 && (
                      <span className="flex h-5 shrink-0 items-center" aria-hidden>
                        <OctaDeskLogo />
                      </span>
                    )}
                    {step.num === 3 && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400" aria-hidden>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18" />
                          <path d="M18 17V9" />
                          <path d="M13 17V5" />
                          <path d="M8 17v-3" />
                        </svg>
                      </span>
                    )}
                    <h3 className="font-medium text-zinc-800 dark:text-zinc-200">{step.title}</h3>
                    {step.beta && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                        Beta
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">{step.desc}</p>
                  {step.cta && (
                    step.cta.href === "#webhooks" ? (
                      <button
                        type="button"
                        onClick={() => { setWebhooksOpen(true); document.getElementById("webhooks")?.scrollIntoView({ behavior: "smooth" }); }}
                        className="inline-block mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 underline underline-offset-2 text-left"
                      >
                        {step.cta.label} →
                      </button>
                    ) : (
                      <Link
                        href={step.cta.href}
                        className="inline-block mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 underline underline-offset-2"
                      >
                        {step.cta.label} →
                      </Link>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Webhooks (mesma tela) */}
          <div id="webhooks" className="mt-10 scroll-mt-8">
            <button
              type="button"
              onClick={() => setWebhooksOpen(!webhooksOpen)}
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 underline underline-offset-2"
            >
              {webhooksOpen ? "Ocultar URLs dos webhooks" : "Ver URLs dos webhooks"}
            </button>
            {webhooksOpen && (
              <div className="mt-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-sm space-y-4">
                <p className="text-zinc-600 dark:text-zinc-400">
                  Configure no seu sistema de atendimento estas URLs (POST), com o header de segredo que você recebeu:
                </p>
                <ul className="space-y-2 font-mono text-zinc-700 dark:text-zinc-300">
                  <li><span className="text-zinc-500 dark:text-zinc-500">Conversa iniciada:</span> {baseUrl || "https://seu-dominio.com"}/api/webhooks/lead</li>
                  <li><span className="text-zinc-500 dark:text-zinc-500">SQL:</span> {baseUrl || "https://seu-dominio.com"}/api/webhooks/sql</li>
                  <li><span className="text-zinc-500 dark:text-zinc-500">Venda:</span> {baseUrl || "https://seu-dominio.com"}/api/webhooks/sale</li>
                </ul>
                <div>
                  <p className="text-zinc-600 dark:text-zinc-400 font-medium mb-2">No webhook <strong>Conversa iniciada</strong> (lead), envie obrigatoriamente:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-zinc-600 dark:text-zinc-400">
                    <li>Telefone do lead</li>
                    <li>Id do anúncio</li>
                    <li>Ctwa_clid</li>
                    <li>Headline do anúncio</li>
                    <li>URL de origem (source_url)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/configuracoes"
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 underline underline-offset-2"
            >
              Ir para Configurações →
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-400 underline underline-offset-2"
            >
              Abrir Dashboard →
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 dark:border-zinc-800/80 px-6 py-6 sm:px-8 transition-colors duration-300 ease-in-out">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs text-zinc-500">
            Dúvidas sobre a integração? Consulte a documentação ou fale com o suporte.
          </p>
        </div>
      </footer>
    </main>
  );
}
