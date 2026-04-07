"use client";

import Link from "next/link";
import { DeskOctadeskSyncInfo } from "@/components/settings/DeskOctadeskSyncInfo";
import { DeskProviderForm } from "@/components/settings/DeskProviderForm";
import { DeskSqlTagMarkersForm } from "@/components/settings/DeskSqlTagMarkersForm";
import { DeskSandboxApiPanel } from "@/components/settings/DeskSandboxApiPanel";
import { useRequiredPartner } from "@/lib/use-required-partner";
import { isSandboxPartnerTenant } from "@/lib/sandbox-partner";

export default function ConfiguracoesDeskPage() {
  const {
    partnerId,
    partnerName,
    partnerSlug,
    isLoading: isPartnerLoading,
    error: partnerError,
  } = useRequiredPartner();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-8">
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">Configurar desk de atendimento</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Esta pagina prepara a integracao por provedor de forma agnostica. Inicialmente, o provider habilitado e Octadesk.
        </p>

        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>}

        {partnerId && <DeskProviderForm partnerId={partnerId} />}

        {partnerId && <DeskSqlTagMarkersForm partnerId={partnerId} />}

        {partnerId && <DeskOctadeskSyncInfo partnerId={partnerId} />}

        {partnerId && isSandboxPartnerTenant(partnerName, partnerSlug) && (
          <DeskSandboxApiPanel partnerId={partnerId} />
        )}

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes/webhooks" className="text-[var(--accent)] hover:underline underline-offset-2">
            Ir para Webhooks
          </Link>
          <span>·</span>
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">
            Voltar para Configuracoes
          </Link>
        </p>
      </div>
    </main>
  );
}
