"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";

export function MonitoriaLogsCta() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
          <BarChart3 className="h-4 w-4 text-[var(--accent)]" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--foreground)]">Monitoria e logs da integração</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Acompanhe execução, saúde da sincronização e análise técnica por métricas e logs.
          </p>
          <Link
            href="/configuracoes/desk/monitoria"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2"
          >
            Ir para Monitoria →
          </Link>
        </div>
      </div>
    </div>
  );
}

