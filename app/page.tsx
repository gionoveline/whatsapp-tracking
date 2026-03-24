"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
    cta: { label: "Configurar Webhooks", href: "/configuracoes/webhooks" },
  },
  {
    num: 3,
    title: "Veja o funil e exporte",
    desc: "Acompanhe o funil no Dashboard. Exporte os dados para Excel, Power BI ou onde precisar.",
    cta: { label: "Abrir Dashboard", href: "/dashboard" },
  },
  {
    num: 4,
    title: "Envio de conversões para a Meta",
    desc: "Envie eventos Lead, SQL e Venda para a Meta para otimização das campanhas.",
    cta: { label: "Configurar conversões", href: "/configuracoes/conversoes" },
    beta: true,
  },
];

function HomeContent() {
  const searchParams = useSearchParams();
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [showCompanyCreatedBanner, setShowCompanyCreatedBanner] = useState(true);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const companyCreated = useMemo(
    () => searchParams.get("company_created") === "1",
    [searchParams]
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      {/* Hero — com faixa diagonal e animação em sequência */}
      <section className="relative overflow-hidden border-b border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-b from-[var(--card)] via-[var(--background)] to-[var(--background)] bg-grain">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/8 via-transparent to-transparent pointer-events-none" aria-hidden />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[var(--accent)]/5 to-transparent skew-x-[-12deg] origin-top-right pointer-events-none" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-6 pt-14 pb-20 sm:px-8 sm:pt-20 sm:pb-24 text-center">
          {companyCreated && showCompanyCreatedBanner && (
            <div className="mb-4 rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-800 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              <div className="flex items-center justify-between gap-3">
                <span>Empresa criada com sucesso. Agora voce pode continuar sua configuracao.</span>
                <button
                  type="button"
                  onClick={() => setShowCompanyCreatedBanner(false)}
                  className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl animate-fade-in-up">
            <span className="inline-flex items-center justify-center gap-3">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/3840px-WhatsApp.svg.png"
                alt="Logo do WhatsApp"
                className="h-9 w-9 sm:h-10 sm:w-10"
              />
              <span>WhatsApp Tracking</span>
            </span>
          </h1>
          <p className="mt-4 text-lg text-[var(--muted-foreground)] sm:text-xl animate-stagger-1">
            Descubra quais anúncios geram vendas no WhatsApp
          </p>
          <p className="mt-3 max-w-xl mx-auto text-sm text-[var(--muted-foreground)]/90 animate-stagger-2">
            Conecte o que acontece no WhatsApp — leads, SQL e vendas — às campanhas, conjuntos de anúncios e anúncios de origem.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-stagger-3">
            <Link
              href="/configuracoes"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/25 hover:opacity-90 hover:shadow-[var(--accent)]/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
            >
              Configurações
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border-2 border-zinc-300 dark:border-zinc-600 bg-[var(--card)] px-6 py-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Onboarding — cards com hover e espaçamento generoso */}
      <section className="px-6 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-xl font-semibold text-[var(--foreground)] sm:text-2xl">
            Como começar
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Em poucos passos você conecta suas campanhas ao que acontece no WhatsApp.
          </p>
          <ol className="mt-10 space-y-5">
            {steps.map((step, index) => (
              <li
                key={step.num}
                className="group relative flex gap-5 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/90 bg-[var(--card)] p-5 sm:p-6 transition-all duration-300 hover:border-[var(--accent)]/30 hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/30 hover:-translate-y-0.5"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 text-sm font-semibold text-[var(--accent)]"
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
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--accent)]" aria-hidden>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18" />
                          <path d="M18 17V9" />
                          <path d="M13 17V5" />
                          <path d="M8 17v-3" />
                        </svg>
                      </span>
                    )}
                    <h3 className="font-display font-medium text-[var(--foreground)]">{step.title}</h3>
                    {step.beta && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                        Beta
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{step.desc}</p>
                  {step.cta &&
                    (step.cta.href === "#webhooks" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setWebhooksOpen(true);
                          document.getElementById("webhooks")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="mt-3 text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2 text-left"
                      >
                        {step.cta.label} →
                      </button>
                    ) : (
                      <Link
                        href={step.cta.href}
                        className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2"
                      >
                        {step.cta.label} →
                      </Link>
                    ))}
                </div>
              </li>
            ))}
          </ol>

          {/* Webhooks */}
          <div id="webhooks" className="mt-12 scroll-mt-8">
            <button
              type="button"
              onClick={() => setWebhooksOpen(!webhooksOpen)}
              className="text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2"
            >
              {webhooksOpen ? "Ocultar URLs dos webhooks" : "Ver URLs dos webhooks"}
            </button>
            {webhooksOpen && (
              <div className="mt-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[var(--muted)]/50 text-sm space-y-4">
                <p className="text-[var(--muted-foreground)]">
                  Configure no seu sistema de atendimento estas URLs (POST), com o header de token (
                  <code className="font-mono text-xs">x-webhook-secret</code> ou{" "}
                  <code className="font-mono text-xs">Authorization: Bearer …</code>) e o UUID da empresa em{" "}
                  <code className="font-mono text-xs">x-partner-id</code> (tabela <code className="font-mono text-xs">partners</code> no Supabase; o parceiro inicial padrão é{" "}
                  <code className="font-mono text-xs">slug = default</code>).
                </p>
                <ul className="space-y-2 font-mono text-[var(--foreground)] text-xs sm:text-sm">
                  <li>
                    <span className="text-[var(--muted-foreground)]">Conversa iniciada:</span>{" "}
                    {baseUrl || "https://seu-dominio.com"}/api/webhooks/lead
                  </li>
                  <li>
                    <span className="text-[var(--muted-foreground)]">SQL:</span>{" "}
                    {baseUrl || "https://seu-dominio.com"}/api/webhooks/sql
                  </li>
                  <li>
                    <span className="text-[var(--muted-foreground)]">Venda:</span>{" "}
                    {baseUrl || "https://seu-dominio.com"}/api/webhooks/sale
                  </li>
                </ul>
                <div>
                  <p className="text-[var(--muted-foreground)] font-medium mb-2">
                    No webhook <strong className="text-[var(--foreground)]">Conversa iniciada</strong> (lead), envie obrigatoriamente:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[var(--muted-foreground)]">
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

          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              href="/configuracoes"
              className="text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2"
            >
              Ir para Configurações →
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline underline-offset-2"
            >
              Abrir Dashboard →
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200/80 dark:border-zinc-800/80 px-6 py-8 sm:px-8 transition-colors duration-300">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs text-[var(--muted-foreground)]">
            Dúvidas sobre a integração? Consulte a documentação ou fale com o suporte.
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" />}>
      <HomeContent />
    </Suspense>
  );
}
