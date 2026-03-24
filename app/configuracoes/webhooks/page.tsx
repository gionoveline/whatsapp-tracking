"use client";

import Link from "next/link";
import { useState } from "react";
import { WebhookSecretCard } from "@/components/settings/WebhookSecretCard";
import { useRequiredPartner } from "@/lib/use-required-partner";

export default function ConfiguracoesWebhooksPage() {
  const { partnerId, isLoading: isPartnerLoading, error: partnerError } = useRequiredPartner();
  const [copyMessage, setCopyMessage] = useState("");
  const leadExample = `{
  "id": "conv_12345",
  "createdAt": "2026-03-20T14:25:00.000Z",
  "contact": { "name": "Maria Silva" },
  "customFields": [
    {
      "id": "octabsp",
      "integrator": {
        "from": { "number": "+5581999999999" },
        "customFields": {
          "messages": [
            {
              "referral": {
                "source_id": "120210000000000001",
                "ctwa_clid": "AQzXy123...",
                "headline": "Agende sua consulta",
                "source_url": "https://www.facebook.com/ads/library/?id=120210000000000001"
              }
            }
          ]
        }
      }
    }
  ]
}`;
  const sqlExample = `{
  "conversation_id": "conv_12345",
  "occurred_at": "2026-03-20T15:10:00.000Z",
  "opp_id": "OPP-1001"
}`;
  const sqlByPhoneExample = `{
  "phone": "+5581999999999",
  "occurred_at": "2026-03-20T15:10:00.000Z",
  "opp_id": "OPP-1001"
}`;
  const saleExample = `{
  "conversation_id": "conv_12345",
  "occurred_at": "2026-03-20T16:20:00.000Z"
}`;
  const saleByPhoneExample = `{
  "phone": "+5581999999999",
  "occurred_at": "2026-03-20T16:20:00.000Z"
}`;
  const curlExampleByConversation = `curl -X POST "https://SEU_DOMINIO/api/webhooks/sql" \\
  -H "Content-Type: application/json" \\
  -H "x-partner-id: UUID_DA_EMPRESA" \\
  -H "x-webhook-secret: TOKEN_DO_WEBHOOK" \\
  -d '{"conversation_id":"conv_12345","occurred_at":"2026-03-20T15:10:00.000Z","opp_id":"OPP-1001"}'`;
  const curlExampleByPhone = `curl -X POST "https://SEU_DOMINIO/api/webhooks/sql" \\
  -H "Content-Type: application/json" \\
  -H "x-partner-id: UUID_DA_EMPRESA" \\
  -H "x-webhook-secret: TOKEN_DO_WEBHOOK" \\
  -d '{"phone":"+5581999999999","occurred_at":"2026-03-20T15:10:00.000Z","opp_id":"OPP-1001"}'`;
  const saleCurlByConversation = `curl -X POST "https://SEU_DOMINIO/api/webhooks/sale" \\
  -H "Content-Type: application/json" \\
  -H "x-partner-id: UUID_DA_EMPRESA" \\
  -H "x-webhook-secret: TOKEN_DO_WEBHOOK" \\
  -d '{"conversation_id":"conv_12345","occurred_at":"2026-03-20T16:20:00.000Z"}'`;
  const saleCurlByPhone = `curl -X POST "https://SEU_DOMINIO/api/webhooks/sale" \\
  -H "Content-Type: application/json" \\
  -H "x-partner-id: UUID_DA_EMPRESA" \\
  -H "x-webhook-secret: TOKEN_DO_WEBHOOK" \\
  -d '{"phone":"+5581999999999","occurred_at":"2026-03-20T16:20:00.000Z"}'`;

  const handleCopyPartnerId = async () => {
    if (!partnerId) return;
    await navigator.clipboard.writeText(partnerId).catch(() => null);
    setCopyMessage("UUID da empresa copiado.");
    window.setTimeout(() => setCopyMessage(""), 2500);
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
          Documentacao de webhooks
        </h1>

        <p className="text-sm text-[var(--muted-foreground)]">
          Especificacao tecnica para integracao dos eventos de <code className="font-mono text-xs">lead</code>,{" "}
          <code className="font-mono text-xs">sql</code> e <code className="font-mono text-xs">sale</code>.
        </p>

        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/20 p-5 text-sm space-y-3">
          <h2 className="font-display text-base text-[var(--foreground)]">Identificador da empresa (x-partner-id)</h2>
          <p className="text-[var(--muted-foreground)]">
            Use o UUID abaixo no header <code className="font-mono text-xs">x-partner-id</code> em todas as chamadas.
          </p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs break-all">
            {partnerId || "Sem empresa ativa selecionada"}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleCopyPartnerId()}
              disabled={!partnerId}
              className="inline-flex items-center rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)]/50 disabled:opacity-50"
            >
              Copiar UUID
            </button>
            {copyMessage && <span className="text-xs text-[var(--accent)]">{copyMessage}</span>}
          </div>
        </section>

        {partnerId && <WebhookSecretCard partnerId={partnerId} />}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/20 p-5 text-sm space-y-3">
          <h2 className="font-display text-base text-[var(--foreground)]">1) Endpoints</h2>
          <ul className="space-y-2 font-mono text-xs sm:text-sm">
            <li><span className="text-[var(--muted-foreground)]">POST</span> /api/webhooks/lead</li>
            <li><span className="text-[var(--muted-foreground)]">POST</span> /api/webhooks/sql</li>
            <li><span className="text-[var(--muted-foreground)]">POST</span> /api/webhooks/sale</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] p-5 text-sm space-y-4">
          <h2 className="font-display text-base text-[var(--foreground)]">2) Headers obrigatorios</h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[var(--muted)]/40">
                <tr>
                  <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Header</th>
                  <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Descricao</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--border)]">
                  <td className="p-3 font-mono">Content-Type: application/json</td>
                  <td className="p-3 text-[var(--muted-foreground)]">Tipo do payload</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="p-3 font-mono">x-partner-id</td>
                  <td className="p-3 text-[var(--muted-foreground)]">UUID da empresa (tenant)</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="p-3 font-mono">x-webhook-secret</td>
                  <td className="p-3 text-[var(--muted-foreground)]">Token do webhook (ou Authorization: Bearer)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] p-5 text-sm space-y-5">
          <h2 className="font-display text-base text-[var(--foreground)]">3) Contrato por evento</h2>

          <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
            <p className="font-medium text-[var(--foreground)]">
              <code className="font-mono text-xs">POST /api/webhooks/lead</code>
            </p>
            <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-0.5">
              <li><code className="font-mono text-xs">id</code> (conversation id)</li>
              <li><code className="font-mono text-xs">createdAt</code> (ISO 8601)</li>
              <li>telefone do contato</li>
              <li><code className="font-mono text-xs">referral.source_id</code></li>
              <li><code className="font-mono text-xs">referral.ctwa_clid</code></li>
              <li><code className="font-mono text-xs">referral.headline</code></li>
              <li><code className="font-mono text-xs">referral.source_url</code></li>
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
            <p className="font-medium text-[var(--foreground)]">
              <code className="font-mono text-xs">POST /api/webhooks/sql</code>
            </p>
            <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-0.5">
              <li>obrigatorio: <code className="font-mono text-xs">conversation_id</code> ou <code className="font-mono text-xs">phone</code></li>
              <li>obrigatorio: <code className="font-mono text-xs">occurred_at</code> (ISO 8601)</li>
              <li>opcional: <code className="font-mono text-xs">opp_id</code></li>
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
            <p className="font-medium text-[var(--foreground)]">
              <code className="font-mono text-xs">POST /api/webhooks/sale</code>
            </p>
            <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-0.5">
              <li>obrigatorio: <code className="font-mono text-xs">conversation_id</code> ou <code className="font-mono text-xs">phone</code></li>
              <li>obrigatorio: <code className="font-mono text-xs">occurred_at</code> (ISO 8601)</li>
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-900/15 p-5 text-sm space-y-2">
          <h2 className="font-display text-base text-[var(--foreground)]">4) Regra de data e hora</h2>
          <p className="text-[var(--muted-foreground)]">
            Data/hora e obrigatoria nos eventos para garantir que os graficos reflitam o momento real da ocorrencia.
          </p>
          <p className="text-[var(--muted-foreground)]">
            Use formato ISO 8601 (ex.: <code className="font-mono text-xs">2026-03-20T16:20:00.000Z</code>).
            Em <code className="font-mono text-xs">lead</code>, usar <code className="font-mono text-xs">createdAt</code>; em{" "}
            <code className="font-mono text-xs">sql</code> e <code className="font-mono text-xs">sale</code>, usar{" "}
            <code className="font-mono text-xs">occurred_at</code>.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] p-5 text-sm space-y-4">
          <h2 className="font-display text-base text-[var(--foreground)]">5) Exemplos de payload</h2>

          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">Lead</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {leadExample}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">SQL</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {sqlExample}
            </pre>
            <p className="text-[var(--muted-foreground)]">Alternativa por telefone:</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {sqlByPhoneExample}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">Sale</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {saleExample}
            </pre>
            <p className="text-[var(--muted-foreground)]">Alternativa por telefone:</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {saleByPhoneExample}
            </pre>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] p-5 text-sm space-y-4">
          <h2 className="font-display text-base text-[var(--foreground)]">6) Exemplo de chamada (curl)</h2>
          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">SQL por conversation_id</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {curlExampleByConversation}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">SQL por phone</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {curlExampleByPhone}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">Sale por conversation_id</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {saleCurlByConversation}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-[var(--foreground)]">Sale por phone</p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] p-3 text-xs font-mono">
              {saleCurlByPhone}
            </pre>
          </div>
        </section>

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">← Conectar Meta</Link>
          <span>·</span>
          <Link href="/" className="text-[var(--accent)] hover:underline underline-offset-2">Início</Link>
        </p>
      </div>
    </main>
  );
}
