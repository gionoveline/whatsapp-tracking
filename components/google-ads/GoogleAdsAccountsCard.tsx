"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";

type MappingItem = { enabled: boolean; conversion_action_id: string | null };
type Mapping = { lead: MappingItem; sql: MappingItem; venda: MappingItem };

export type GoogleAdsAccountItem = {
  id: string;
  label: string;
  customer_id: string;
  login_customer_id: string;
  currency_code: string;
  mapping: Mapping;
  is_default: boolean;
};

const EMPTY_MAPPING: Mapping = {
  lead: { enabled: false, conversion_action_id: null },
  sql: { enabled: false, conversion_action_id: null },
  venda: { enabled: false, conversion_action_id: null },
};

const OUR_EVENT_LABELS: Record<keyof Mapping, string> = {
  lead: "Lead",
  sql: "SQL",
  venda: "Venda",
};

type Props = {
  partnerId: string;
};

export function GoogleAdsAccountsCard({ partnerId }: Props) {
  const [accounts, setAccounts] = useState<GoogleAdsAccountItem[]>([]);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("BRL");
  const [isDefault, setIsDefault] = useState(false);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setLabel("");
    setCustomerId("");
    setLoginCustomerId("");
    setCurrencyCode("BRL");
    setIsDefault(false);
    setMapping(EMPTY_MAPPING);
  }, []);

  const load = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/settings/google-ads-accounts", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar contas");
      setAccounts((data.accounts as GoogleAdsAccountItem[]) ?? []);
      setLegacyAvailable(Boolean(data.legacy_available));
    } catch (e) {
      setAccounts([]);
      setMessage(e instanceof Error ? e.message : "Erro ao carregar contas");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (account: GoogleAdsAccountItem) => {
    setEditingId(account.id);
    setLabel(account.label);
    setCustomerId(account.customer_id);
    setLoginCustomerId(account.login_customer_id ?? "");
    setCurrencyCode(account.currency_code || "BRL");
    setIsDefault(account.is_default);
    setMapping(account.mapping ?? EMPTY_MAPPING);
    setMessage("");
    setStatus("idle");
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

  const handleSave = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const res = await authFetch("/api/settings/google-ads-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        partnerId,
        body: JSON.stringify({
          id: editingId ?? undefined,
          label,
          customer_id: customerId,
          login_customer_id: loginCustomerId.trim() || undefined,
          currency_code: currencyCode,
          mapping,
          is_default: isDefault,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao salvar conta");
      setStatus("success");
      setMessage(editingId ? "Conta atualizada." : "Conta adicionada.");
      resetForm();
      await load();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Erro ao salvar conta");
    }
  };

  const handleImportLegacy = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const res = await authFetch("/api/settings/google-ads-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        partnerId,
        body: JSON.stringify({ import_legacy: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setStatus("success");
      setMessage("Configuração atual importada como conta padrão.");
      await load();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Erro ao importar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover esta conta Google Ads? Campanhas vinculadas voltam ao padrão.")) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await authFetch(`/api/settings/google-ads-accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        partnerId,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao remover");
      if (editingId === id) resetForm();
      setStatus("success");
      setMessage("Conta removida.");
      await load();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm overflow-hidden">
      <CardHeader>
        <CardTitle className="font-display text-base">Contas Google Ads (roteamento)</CardTitle>
        <CardDescription>
          Cadastre várias contas sob o mesmo MCC. Campanhas EMR podem apontar para uma conta específica; as demais
          usam a conta marcada como padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando contas…</p>
        ) : (
          <>
            {accounts.length === 0 && legacyAvailable && (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 space-y-3">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Você já tem conversões configuradas abaixo. Importe como primeira conta nomeada para habilitar
                  roteamento por campanha.
                </p>
                <Button type="button" variant="outline" onClick={() => void handleImportLegacy()} disabled={status === "loading"}>
                  Importar configuração atual
                </Button>
              </div>
            )}

            {accounts.length > 0 && (
              <ul className="space-y-3">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="rounded-xl border border-[var(--border)] p-4 flex flex-wrap items-start justify-between gap-3"
                  >
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        {account.label}
                        {account.is_default && (
                          <span className="ml-2 text-xs font-normal text-[var(--accent)]">(padrão)</span>
                        )}
                      </p>
                      <p className="text-sm text-[var(--muted-foreground)] font-mono mt-1">
                        conta {account.customer_id}
                        {account.mapping?.sql?.conversion_action_id
                          ? ` · SQL ${account.mapping.sql.conversion_action_id}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(account)}>
                        Editar
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(account.id)}>
                        Remover
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-xl border border-[var(--border)] p-4 space-y-4">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {editingId ? "Editar conta" : "Nova conta"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ga-account-label">Nome</Label>
                  <Input
                    id="ga-account-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Conta Search — região Sul"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ga-account-customer">ID da conta Google Ads</Label>
                  <Input
                    id="ga-account-customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="font-mono"
                    placeholder="1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ga-account-login">MCC desta conta (opcional)</Label>
                  <Input
                    id="ga-account-login"
                    value={loginCustomerId}
                    onChange={(e) => setLoginCustomerId(e.target.value)}
                    className="font-mono"
                    placeholder="Usa o MCC das chaves se vazio"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ga-account-currency">Moeda</Label>
                  <Input
                    id="ga-account-currency"
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full font-mono uppercase"
                    maxLength={3}
                  />
                </div>
              </div>

              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                      <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Evento</th>
                      <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">ID da ação</th>
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

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                Conta padrão (campanhas sem vínculo específico)
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
                  disabled={status === "loading"}
                  onClick={() => void handleSave()}
                >
                  {status === "loading" ? "Salvando…" : editingId ? "Salvar alterações" : "Adicionar conta"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancelar edição
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {message && (
          <p
            className={`text-sm ${status === "success" ? "text-[var(--accent)]" : status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function useGoogleAdsAccountOptions(partnerId: string) {
  const [accounts, setAccounts] = useState<GoogleAdsAccountItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await authFetch("/api/settings/google-ads-accounts", { partnerId });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setAccounts((data.accounts as GoogleAdsAccountItem[]) ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  return { accounts, loading };
}
