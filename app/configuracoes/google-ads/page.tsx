"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import { useRequiredPartner } from "@/lib/use-required-partner";

type MappingItem = { enabled: boolean; conversion_action_id: string | null };
type Mapping = { lead: MappingItem; sql: MappingItem; venda: MappingItem };

const OUR_EVENT_LABELS: Record<keyof Mapping, string> = {
  lead: "Lead (conversa iniciada)",
  sql: "SQL",
  venda: "Venda",
};

export default function GoogleAdsConfigPage() {
  const { partnerId, error: partnerError, isLoading: isPartnerLoading } = useRequiredPartner();

  const [connectionStatus, setConnectionStatus] = useState<{
    refresh_token_configured?: boolean;
    customer_id_configured?: boolean;
    developer_token_env?: boolean;
    oauth_client_env?: boolean;
  } | null>(null);

  const [refreshToken, setRefreshToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [tokenStatus, setTokenStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [tokenMessage, setTokenMessage] = useState("");

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
      const tokenData = await tokenRes.json().catch(() => ({}));
      const convData = await convRes.json().catch(() => ({}));
      setConnectionStatus(tokenData);
      if (convData.customer_id) setCustomerId(convData.customer_id);
      if (convData.currency_code) setCurrencyCode(convData.currency_code);
      if (convData.mapping) setMapping(convData.mapping);
    };
    void load();
  }, [partnerId]);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenStatus("loading");
    setTokenMessage("");
    const res = await authFetch("/api/settings/google-ads-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({
        refresh_token: refreshToken.trim(),
        customer_id: customerId.trim(),
        login_customer_id: loginCustomerId.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTokenStatus("success");
      setTokenMessage("Conexão Google Ads salva.");
      setRefreshToken("");
      setConnectionStatus({
        refresh_token_configured: true,
        customer_id_configured: true,
        developer_token_env: connectionStatus?.developer_token_env,
        oauth_client_env: connectionStatus?.oauth_client_env,
      });
    } else {
      setTokenStatus("error");
      setTokenMessage(data.error || "Erro ao salvar.");
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

  const envReady =
    connectionStatus?.developer_token_env === true && connectionStatus?.oauth_client_env === true;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
            Google Ads API
          </h1>
          <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Beta
          </span>
        </div>
        {partnerError && <p className="text-sm text-amber-600 dark:text-amber-400">{partnerError}</p>}
        {isPartnerLoading && (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando empresa ativa...</p>
        )}

        <p className="text-sm text-[var(--muted-foreground)]">
          Enriqueça leads com campanha a partir do <code className="text-xs bg-[var(--muted)] px-1 rounded">gclid</code> e
          envie conversões offline (upload de cliques) para otimização. Requer o script de landing em{" "}
          <Link href="/configuracoes/google-lp" className="text-[var(--accent)] hover:underline">
            Google LP
          </Link>
          .
        </p>

        <Card className="rounded-2xl border-[var(--border)] bg-[var(--muted)]/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Documentação</CardTitle>
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
                  click_view (enriquecimento)
                </a>
              </li>
            </ul>
            <p className="text-xs text-[var(--muted-foreground)] pt-1">
              O servidor precisa das variáveis <code className="text-xs">GOOGLE_ADS_DEVELOPER_TOKEN</code>,{" "}
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> e{" "}
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> (OAuth com escopo Google Ads).
            </p>
            {connectionStatus && (
              <p className="text-xs">
                Ambiente:{" "}
                <span className={envReady ? "text-[var(--accent)]" : "text-amber-600 dark:text-amber-400"}>
                  {envReady ? "variáveis globais OK" : "faltam variáveis no servidor"}
                </span>
                {" · "}
                Token: {connectionStatus.refresh_token_configured ? "configurado" : "pendente"}
              </p>
            )}
          </CardContent>
        </Card>

        <form onSubmit={handleTokenSubmit} className="space-y-6">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base">Conectar conta</CardTitle>
              <CardDescription>
                Refresh token OAuth (escopo <code className="text-xs">https://www.googleapis.com/auth/adwords</code>) e ID
                do cliente Google Ads (sem hífens).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="refresh">Refresh token</Label>
                <Input
                  id="refresh"
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="1//0e..."
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cid">Customer ID</Label>
                <Input
                  id="cid"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="font-mono"
                  placeholder="1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-cid">Login customer ID (MCC, opcional)</Label>
                <Input
                  id="login-cid"
                  value={loginCustomerId}
                  onChange={(e) => setLoginCustomerId(e.target.value)}
                  className="font-mono"
                  placeholder="9876543210"
                />
              </div>
              <Button
                type="submit"
                disabled={tokenStatus === "loading"}
                className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
              >
                {tokenStatus === "loading" ? "Salvando…" : "Salvar conexão"}
              </Button>
              {tokenMessage && (
                <p
                  className={`text-sm ${tokenStatus === "success" ? "text-[var(--accent)]" : "text-red-600 dark:text-red-400"}`}
                >
                  {tokenMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </form>

        <form onSubmit={handleConversionsSubmit} className="space-y-6">
          <Card className="rounded-2xl border-[var(--border)] shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="font-display text-base">Conversões offline</CardTitle>
              <CardDescription>
                ID numérico da ação de conversão no Google Ads (Ferramentas → Conversões). Deixe vazio para não enviar.
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
                        Conversion action ID
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
                Para SQL, o lead precisa ter gclid, wbraid ou gbraid capturado na landing.
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
