"use client";

import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <h1 className="font-display text-xl font-semibold text-[var(--foreground)]">
          Erro ao carregar o Dashboard
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {error.message || "Algo deu errado. Tente recarregar a página."}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-medium hover:opacity-90 transition"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] text-sm font-medium hover:border-[var(--accent)]/40 transition"
          >
            Voltar à home
          </Link>
        </div>
      </div>
    </main>
  );
}
