"use client";

import Link from "next/link";
import { DeskProviderForm } from "@/components/settings/DeskProviderForm";
import { MonitoriaLogsCta } from "@/components/settings/MonitoriaLogsCta";
import { useRequiredPartner } from "@/lib/use-required-partner";

export default function ConfiguracoesDeskPage() {
  const {
    partnerId,
    isLoading: isPartnerLoading,
    error: partnerError,
  } = useRequiredPartner();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-8">
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">Configurar desk de atendimento</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Esta página prepara a integração por provedor de forma agnóstica para a operação de atendimento.
        </p>

        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>}

        {partnerId && (
          <div className="space-y-4">
            <DeskProviderForm partnerId={partnerId} />
            <div>
              <MonitoriaLogsCta />
            </div>
          </div>
        )}

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes/desk/monitoria" className="text-[var(--accent)] hover:underline underline-offset-2">
            Ir para Monitoria
          </Link>
          <span>·</span>
          <Link href="/configuracoes/webhooks" className="text-[var(--accent)] hover:underline underline-offset-2">
            Ir para Webhooks
          </Link>
          <span>·</span>
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">
            Voltar para Configurações
          </Link>
        </p>
      </div>
    </main>
  );
}
