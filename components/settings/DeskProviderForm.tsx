"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OctaDeskLogo } from "@/components/ui/OctaDeskLogo";
import { authFetch } from "@/lib/client-auth";
import {
  DESK_PROVIDER_DEFINITIONS,
  DESK_PROVIDER_OPTIONS,
  type DeskProviderId,
} from "@/lib/integrations/providers";
import { ProviderFields } from "@/components/settings/ProviderFields";

type CredentialsResponse = {
  configured?: boolean;
  baseUrl?: string;
  apiTokenConfigured?: boolean;
  error?: string;
};

type ProviderResponse = {
  activeProvider?: DeskProviderId | null;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

export function DeskProviderForm({ partnerId }: { partnerId: string }) {
  const [providerId, setProviderId] = useState<DeskProviderId>("octadesk");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiTokenConfigured, setApiTokenConfigured] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMessage, setTestMessage] = useState("");

  const selectedProvider = useMemo(() => DESK_PROVIDER_DEFINITIONS[providerId], [providerId]);

  useEffect(() => {
    const loadProvider = async () => {
      if (!partnerId) return;
      const response = await authFetch("/api/settings/desk-provider", { partnerId });
      const data = (await response.json().catch(() => ({}))) as ProviderResponse;
      if (response.ok && data.activeProvider && data.activeProvider in DESK_PROVIDER_DEFINITIONS) {
        setProviderId(data.activeProvider);
      }
    };
    void loadProvider();
  }, [partnerId]);

  useEffect(() => {
    const loadCredentials = async () => {
      if (!partnerId || !providerId) return;
      setConfigured(null);
      const response = await authFetch(`/api/settings/desk-credentials?providerId=${providerId}`, { partnerId });
      const data = (await response.json().catch(() => ({}))) as CredentialsResponse;
      if (!response.ok) {
        setConfigured(false);
        return;
      }
      setBaseUrl(data.baseUrl ?? "");
      setApiToken("");
      setApiTokenConfigured(Boolean(data.apiTokenConfigured));
      setConfigured(Boolean(data.configured));
    };
    void loadCredentials();
  }, [partnerId, providerId]);

  const saveProvider = async (nextProvider: DeskProviderId) => {
    const response = await authFetch("/api/settings/desk-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ providerId: nextProvider }),
    });
    return response.ok;
  };

  const handleSaveCredentials = async () => {
    setSaveStatus("loading");
    setSaveMessage("");

    const providerSaved = await saveProvider(providerId);
    if (!providerSaved) {
      setSaveStatus("error");
      setSaveMessage("Nao foi possivel salvar o provedor ativo.");
      return;
    }

    const response = await authFetch("/api/settings/desk-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ providerId, baseUrl, apiToken }),
    });
    const data = (await response.json().catch(() => ({}))) as CredentialsResponse;

    if (!response.ok) {
      setSaveStatus("error");
      setSaveMessage(data.error || "Erro ao salvar credenciais.");
      return;
    }

    setSaveStatus("success");
    setConfigured(true);
    setApiTokenConfigured(true);
    setApiToken("");
    setSaveMessage("Credenciais salvas com sucesso.");
  };

  const handleTestConnection = async () => {
    setTestStatus("loading");
    setTestMessage("");
    const response = await authFetch("/api/settings/desk-test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ providerId, baseUrl, apiToken }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

    if (!response.ok) {
      setTestStatus("error");
      setTestMessage(data.message || data.error || "Falha no teste de conexao.");
      return;
    }

    setTestStatus("success");
    setTestMessage(data.message || "Conexao validada.");
  };

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Desk de atendimento</CardTitle>
        <CardDescription>
          Selecione o provedor e configure as credenciais da API. A rota de webhooks permanece disponivel para consulta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {configured !== null && (
          <p className="text-sm">
            Status:{" "}
            <span className={configured ? "text-[var(--accent)] font-medium" : "text-amber-600 dark:text-amber-400"}>
              {configured ? "Configurado" : "Nao configurado"}
            </span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="desk-provider">Provedor</Label>
          <select
            id="desk-provider"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value as DeskProviderId)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {DESK_PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
            {providerId === "octadesk" && <OctaDeskLogo className="translate-y-[1px]" />}
            {selectedProvider.description}
          </p>
        </div>

        <ProviderFields
          provider={selectedProvider}
          values={{ baseUrl, apiToken }}
          onChange={(field, value) => {
            if (field === "baseUrl") setBaseUrl(value);
            if (field === "apiToken") setApiToken(value);
          }}
          disabled={saveStatus === "loading"}
        />

        {apiTokenConfigured && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Token ja configurado neste tenant. Preencha novamente para rotacionar.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
            disabled={saveStatus === "loading" || !baseUrl.trim() || !apiToken.trim()}
            onClick={() => void handleSaveCredentials()}
          >
            {saveStatus === "loading" ? "Salvando..." : "Salvar credenciais"}
          </Button>
          <Button type="button" variant="outline" disabled={testStatus === "loading"} onClick={() => void handleTestConnection()}>
            {testStatus === "loading" ? "Testando..." : "Testar conexao"}
          </Button>
        </div>

        {saveMessage && (
          <p className={`text-sm ${saveStatus === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--accent)]"}`}>
            {saveMessage}
          </p>
        )}
        {testMessage && (
          <p className={`text-sm ${testStatus === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--accent)]"}`}>
            {testMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
