"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import { useRequiredPartner } from "@/lib/use-required-partner";
import type { GoogleAdsConnectionStatus } from "@/lib/google-ads-settings-keys";
import { GoogleAdsAccountsCard } from "@/components/google-ads/GoogleAdsAccountsCard";
import { GoogleAdsEnhancedLeadsCard } from "@/components/google-ads/GoogleAdsEnhancedLeadsCard";

type MappingItem = { enabled: boolean; conversion_action_id: string | null };
type Mapping = { lead: MappingItem; sql: MappingItem; venda: MappingItem };

const OUR_EVENT_LABELS: Record<keyof Mapping, string> = {
  lead: "Lead (conversa iniciada)",
  sql: "SQL",
  venda: "Venda",
};

function ConfiguredHint({ configured }: { configured: boolean }) {
  if (!configured) return null;
  return (
    <p className="text-xs text-[var(--accent)]">Já salvo — deixe em branco para manter o valor atual.</p>
  );
}

export default function GoogleAdsConfigPage() {
  const { partnerId, error: partnerError, isLoading: isPartnerLoading } = useRequiredPartner();

  const [connectionStatus, setConnectionStatus] = useState<GoogleAdsConnectionStatus | null>(null);

  const [developerToken, setDeveloperToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [keysStatus, setKeysStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [keysMessage, setKeysMessage] = useState("");

  const [currencyCode, setCurrencyCode] = useState("BRL");
  const [mapping, setMapping] = useState<Mapping>({
    lead: { enabled: false, conversion_action_id: null },
    sql: { enabled: false, conversion_action_id: null },
    venda: { enabled: false, conversion_action_id: null },
  });
  const [convStatus, setConvStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [convMessage, setConvMessage] = useState("");

  useEffect(() => {
    if (!partnerId) return;
    const load = async () => {
      const [tokenRes, convRes] = await Promise.all([
        authFetch("/api/settings/google-ads-token", { partnerId }),
        authFetch("/api/settings/google-ads-conversions", { partnerId }),
      ]);
      const tokenData = (await tokenRes.json().catch(() => ({}))) as GoogleAdsConnectionStatus;
      const convData = await convRes.json().catch(() => ({}));
      setConnectionStatus(tokenData);
      if (convData.customer_id) setCustomerId(convData.customer_id);
      if (convData.currency_code) setCurrencyCode(convData.currency_code);
      if (convData.mapping) setMapping(convData.mapping);
    };
    void load();
  }, [partnerId]);

  const handleKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeysStatus("loading");
    setKeysMessage("");
    const res = await authFetch("/api/settings/google-ads-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({
        developer_token: developerToken.trim() || undefined,
        client_id: clientId.trim() || undefined,
        client_secret: clientSecret.trim() || undefined,
        refresh_token: refreshToken.trim() || undefined,
        customer_id: customerId.trim() || undefined,
        login_customer_id: loginCustomerId.trim() || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as GoogleAdsConnectionStatus & { error?: string };
    if (res.ok) {
      setKeysStatus("success");
      setKeysMessage(
        data.credentials_ready
          ? "Chaves salvas. Integração pronta para enriquecer campanhas e enviar conversões."
          : "Salvo parcialmente. Preencha os campos que ainda faltam."
      );
      setDeveloperToken("");
      setClientSecret("");
      setRefreshToken("");
      setConnectionStatus(data);
    } else {
      setKeysStatus("error");
      setKeysMessage(data.error || "Erro ao salvar.");
    }
  };

  const handleMappingChange = (key: keyof Mapping, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setMapping((prev) => ({
        ...prev,
        [key]: { enabled: false, conversion_action_id: null },
      }));
      return;
    }
    setMapping((prev) => ({
      ...prev,
      [key]: { enabled: true, conversion_action_id: trimmed },
    }));
  };

  const handleConversionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvStatus("loading");
    setConvMessage("");
    const res = await authFetch("/api/settings/google-ads-conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({
        customer_id: customerId.trim(),
        currency_code: currencyCode.trim(),
        mapping,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setConvStatus("success");
      setConvMessage("Mapeamento de conversões salvo.");
    } else {
      setConvStatus("error");
      setConvMessage(data.error || "Erro ao salvar.");
    }
  };

  const status = connectionStatus;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">Google Ads API</h1>
          <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Beta
          </span>
        </div>
        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa…</p>
        )}

        <p className="text-sm text-[var(--muted-foreground)]">
          Cole as chaves no mesmo nome do documento que a EMR/Google enviou. Enriquecimento de campanha usa o{" "}
          <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code> da{" "}
          <Link href="/configuracoes/google-lp" className="text-[var(--accent)] hover:underline">
            landing Google LP
          </Link>
          .
        </p>

        {status && (
          <p className="text-sm rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 px-4 py-3">
            Status:{" "}
            <span
              className={
                status.credentials_ready
                  ? "font-medium text-[var(--accent)]"
                  : "font-medium text-amber-700 dark:text-amber-300"
              }
            >
              {status.credentials_ready ? "credenciais completas" : "faltam chaves obrigatórias"}
            </span>
            {status.customer_id_preview && (
              <span className="text-[var(--muted-foreground)]"> · conta {status.customer_id_preview}</span>
            )}
          </p>
        )}

        <form onSubmit={handleKeysSubmit} className="space-y-6">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base">Chaves do Google</CardTitle>
              <CardDescription>
                Mesmos nomes do e-mail/documento da API. Valores sensíveis ficam criptografados por empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="developer-token">Developer Token</Label>
                <Input
                  id="developer-token"
                  type="password"
                  value={developerToken}
                  onChange={(e) => setDeveloperToken(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Cole o Developer Token"
                  autoComplete="off"
                />
                <ConfiguredHint configured={status?.developer_token_configured ?? false} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-id">ID do cliente</Label>
                <Input
                  id="client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="….apps.googleusercontent.com"
                  autoComplete="off"
                />
                <ConfiguredHint configured={status?.oauth_client_id_configured ?? false} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-secret">Chave secreta do cliente</Label>
                <Input
                  id="client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="GOCSPX-…"
                  autoComplete="off"
                />
                <ConfiguredHint configured={status?.oauth_client_secret_configured ?? false} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="refresh-token">Refresh Token</Label>
                <Input
                  id="refresh-token"
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="1//0e…"
                  autoComplete="off"
                />
                <ConfiguredHint configured={status?.refresh_token_configured ?? false} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base">Conta Google Ads</CardTitle>
              <CardDescription>
                Não costuma vir no mesmo e-mail das chaves OAuth. No Google Ads, canto superior direito — só
                números, sem hífens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-id">ID da conta Google Ads</Label>
                <Input
                  id="customer-id"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="font-mono"
                  placeholder="1234567890"
                />
                <ConfiguredHint configured={status?.customer_id_configured ?? false} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-customer-id">ID da conta gerente (MCC, opcional)</Label>
                <Input
                  id="login-customer-id"
                  value={loginCustomerId}
                  onChange={(e) => setLoginCustomerId(e.target.value)}
                  className="font-mono"
                  placeholder="9876543210"
                />
                <ConfiguredHint configured={status?.login_customer_id_configured ?? false} />
              </div>

              <Button
                type="submit"
                disabled={keysStatus === "loading"}
                className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
              >
                {keysStatus === "loading" ? "Salvando…" : "Salvar chaves do Google"}
              </Button>
              {keysMessage && (
                <p
                  className={`text-sm ${keysStatus === "success" ? "text-[var(--accent)]" : keysStatus === "error" ? "text-red-600 dark:text-red-400" : ""}`}
                >
                  {keysMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </form>

        {partnerId && <GoogleAdsAccountsCard partnerId={partnerId} />}
        {partnerId && <GoogleAdsEnhancedLeadsCard partnerId={partnerId} />}

        <form onSubmit={handleConversionsSubmit} className="space-y-6">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="font-display text-base">Conversões offline (legado / fallback)</CardTitle>
              <CardDescription>
                Usado quando nenhuma conta nomeada está cadastrada, ou como referência ao importar. Com contas
                nomeadas acima, o roteamento prioriza elas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Input
                  id="currency"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-24 font-mono uppercase"
                  maxLength={3}
                />
              </div>
              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Evento no app</th>
                      <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">
                        ID da ação de conversão
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(OUR_EVENT_LABELS) as Array<keyof Mapping>).map((key) => (
                      <tr key={key} className="border-b border-[var(--border)] last:border-0">
                        <td className="p-3">{OUR_EVENT_LABELS[key]}</td>
                        <td className="p-3">
                          <Input
                            type="text"
                            className="font-mono"
                            placeholder="Não enviar"
                            value={mapping[key]?.conversion_action_id ?? ""}
                            onChange={(e) => handleMappingChange(key, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Com mapeamento salvo, o app envia ao Google: <strong className="text-[var(--foreground)]">Lead</strong>{" "}
                (primeiro contato com protocolo GLP), <strong className="text-[var(--foreground)]">SQL</strong>{" "}
                (qualificação) e <strong className="text-[var(--foreground)]">Venda</strong> (webhook de venda). O lead
                precisa ter <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code>,{" "}
                <code className="text-xs bg-[var(--muted)] px-1 rounded">wbraid</code> ou{" "}
                <code className="text-xs bg-[var(--muted)] px-1 rounded">gbraid</code> da landing.
              </p>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={convStatus === "loading"}
            className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
          >
            {convStatus === "loading" ? "Salvando…" : "Salvar conversões"}
          </Button>
          {convMessage && (
            <p
              className={`text-sm ${convStatus === "success" ? "text-[var(--accent)]" : "text-red-600 dark:text-red-400"}`}
            >
              {convMessage}
            </p>
          )}
        </form>

        <Card className="rounded-2xl border-[var(--border)] bg-[var(--muted)]/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Referência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <a
                  href="https://developers.google.com/google-ads/api/docs/conversions/upload-clicks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Upload de conversões por clique (gclid)
                </a>
              </li>
              <li>
                <a
                  href="https://developers.google.com/google-ads/api/docs/reporting/click-view"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  click_view (nome de campanha)
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>

        <p className="text-sm text-[var(--muted-foreground)] flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/configuracoes/google-lp" className="text-[var(--accent)] hover:underline underline-offset-2">
            ← Google LP (script)
          </Link>
          <span>·</span>
          <Link href="/configuracoes" className="text-[var(--accent)] hover:underline underline-offset-2">
            Configurações
          </Link>
        </p>
      </div>
    </main>
  );
}
