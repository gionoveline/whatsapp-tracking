"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { googleLpCaptureSourceLabel } from "@/lib/google-lp-capture-source";

type Props = {
  scriptOrigin: string;
  partnerId: string;
  whatsappPhoneConfigured: boolean;
};

export function GoogleWciExtensionsCard({ scriptOrigin, partnerId, whatsappPhoneConfigured }: Props) {
  const wciExample =
    scriptOrigin && partnerId
      ? `${scriptOrigin.replace(/\/$/, "")}/wci?partner_id=${partnerId}&emr_id=ID00111`
      : "";

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm border-l-4 border-l-[var(--accent)]">
      <CardHeader>
        <CardTitle className="font-display text-lg">Extensões de mensagem WhatsApp (WCI)</CardTitle>
        <CardDescription>
          Para anúncios Google com <strong className="text-[var(--foreground)]">recursos de mensagem</strong> ou{" "}
          <strong className="text-[var(--foreground)]">click-to-WhatsApp</strong> — sem landing page. Mesmo fluxo
          do projeto open source{" "}
          <a
            href="https://github.com/google/wci"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            google/wci
          </a>
          , integrado ao nosso backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
        {!whatsappPhoneConfigured && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3">
            Salve o <strong>telefone WhatsApp padrão</strong> acima antes de usar links WCI sem parâmetro{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">next=</code>.
          </p>
        )}

        <ol className="list-decimal list-inside space-y-2">
          <li>
            Cadastre o ID EMR no bloco <strong className="text-[var(--foreground)]">Campanhas EMR</strong> e copie o
            link <strong className="text-[var(--foreground)]">WCI</strong> da linha.
          </li>
          <li>
            No Google Ads, em <strong className="text-[var(--foreground)]">Recursos → Mensagem</strong> (ou extensão
            de WhatsApp), cole o link WCI como <strong className="text-[var(--foreground)]">URL final</strong> do
            recurso.
          </li>
          <li>
            Com <strong className="text-[var(--foreground)]">marcação automática</strong> ativa, o Google acrescenta{" "}
            <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code> na URL no clique.
          </li>
          <li>
            O lead abre o WhatsApp com <code className="text-xs bg-[var(--muted)] px-1 rounded">ID00111 - GLP-…</code>{" "}
            na mensagem; o Octadesk sincroniza e enviamos SQL ao Google Ads.
          </li>
        </ol>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4 space-y-2">
          <p className="font-medium text-[var(--foreground)]">Formato do link WCI</p>
          <code className="block text-xs break-all bg-[var(--muted)]/50 p-2 rounded-lg">
            {wciExample || "…/wci?partner_id=UUID&emr_id=ID00111"}
          </code>
          <p className="text-xs">
            Diferença do <code className="bg-[var(--muted)] px-1 rounded">/go</code>:{" "}
            {googleLpCaptureSourceLabel("wci_extension")} — clique direto do anúncio, sem script na landing.
          </p>
        </div>

        <p className="text-xs">
          SQL, Enhanced Conversions e roteamento por conta Google Ads funcionam igual ao fluxo landing. Na monitoria,
          cliques WCI aparecem com origem &quot;{googleLpCaptureSourceLabel("wci_extension")}&quot;.
        </p>
      </CardContent>
    </Card>
  );
}
