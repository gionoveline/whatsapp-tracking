"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { OctaDeskLogo } from "@/components/ui/OctaDeskLogo";
import { authFetch } from "@/lib/client-auth";
import { DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES } from "@/lib/desk-sync-interval";
import { brasiliaTimeToUtc, utcTimeToBrasilia } from "@/lib/timezone-brasilia";
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

type SqlMarkersResponse = {
  markers?: string[];
  defaults?: string[];
  customized?: boolean;
  error?: string;
};

type SyncIntervalResponse = {
  intervalMinutes?: number;
  options?: number[];
  dailyTimeUtc?: string;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

function normalize24hTimeInput(value: string): string {
  const only = value.replace(/[^\d:]/g, "");
  const match = /^(\d{1,2})(?::?(\d{0,2}))?$/.exec(only);
  if (!match) return "";
  const hhRaw = match[1] ?? "";
  const mmRaw = match[2] ?? "";
  if (!hhRaw) return "";
  const hh = Number.parseInt(hhRaw, 10);
  const mm = mmRaw ? Number.parseInt(mmRaw, 10) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

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
  const [sqlMarkers, setSqlMarkers] = useState<string[]>([]);
  const [sqlDefaults, setSqlDefaults] = useState<string[]>([]);
  const [sqlCustomized, setSqlCustomized] = useState(false);
  const [sqlDraft, setSqlDraft] = useState("");
  const [sqlStatus, setSqlStatus] = useState<Status>("idle");
  const [sqlMessage, setSqlMessage] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(
    DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES
  );
  const [syncIntervalOptions, setSyncIntervalOptions] = useState<number[]>([
    DEFAULT_DESK_OCTADESK_SYNC_INTERVAL_MINUTES,
  ]);
  const [syncIntervalStatus, setSyncIntervalStatus] = useState<Status>("idle");
  const [syncIntervalMessage, setSyncIntervalMessage] = useState("");
  const [dailySyncTimeBrasilia, setDailySyncTimeBrasilia] = useState("00:00");
  const [isEditingConnection, setIsEditingConnection] = useState(false);

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
    const loadSyncInterval = async () => {
      if (!partnerId) return;
      const response = await authFetch("/api/settings/desk-sync-interval", { method: "GET", partnerId });
      const data = (await response.json().catch(() => ({}))) as SyncIntervalResponse;
      if (!response.ok) return;
      if (typeof data.intervalMinutes === "number") setSyncIntervalMinutes(data.intervalMinutes);
      if (Array.isArray(data.options) && data.options.length > 0) setSyncIntervalOptions(data.options);
      if (typeof data.dailyTimeUtc === "string" && data.dailyTimeUtc.trim()) {
        setDailySyncTimeBrasilia(utcTimeToBrasilia(data.dailyTimeUtc));
      }
    };
    void loadSyncInterval();
  }, [partnerId]);

  useEffect(() => {
    const loadSqlMarkers = async () => {
      if (!partnerId) return;
      const response = await authFetch("/api/settings/desk-sql-tag-markers", { method: "GET", partnerId });
      const data = (await response.json().catch(() => ({}))) as SqlMarkersResponse;
      if (!response.ok) return;
      setSqlMarkers(data.markers ?? []);
      setSqlDefaults(data.defaults ?? []);
      setSqlCustomized(Boolean(data.customized));
    };
    void loadSqlMarkers();
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
      const isConfigured = Boolean(data.configured);
      setConfigured(isConfigured);
      setIsEditingConnection(!isConfigured);
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
      setSaveMessage("Não foi possível salvar o provedor ativo.");
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
    setIsEditingConnection(false);
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
      setTestMessage(data.message || data.error || "Falha no teste de conexão.");
      return;
    }

    setTestStatus("success");
    setTestMessage(data.message || "Conexão validada.");
  };

  const addSqlMarker = () => {
    const draft = sqlDraft.trim();
    if (!draft) return;
    const exists = sqlMarkers.some((m) => m.toLowerCase() === draft.toLowerCase());
    if (exists) {
      setSqlDraft("");
      return;
    }
    setSqlMarkers((prev) => [...prev, draft]);
    setSqlDraft("");
  };

  const removeSqlMarker = (value: string) => {
    setSqlMarkers((prev) => prev.filter((m) => m !== value));
  };

  const saveSqlMarkers = async (): Promise<boolean> => {
    setSqlStatus("loading");
    setSqlMessage("");
    const response = await authFetch("/api/settings/desk-sql-tag-markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({ markers: sqlMarkers }),
    });
    const data = (await response.json().catch(() => ({}))) as SqlMarkersResponse;
    if (!response.ok) {
      setSqlStatus("error");
      setSqlMessage(data.error || "Falha ao salvar marcadores SQL.");
      return false;
    }
    setSqlStatus("success");
    setSqlMarkers(data.markers ?? []);
    setSqlCustomized(Boolean(data.customized));
    setSqlMessage("Marcadores SQL salvos.");
    return true;
  };

  const restoreSqlDefaults = () => {
    setSqlMarkers([...sqlDefaults]);
    setSqlDraft("");
  };

  const saveSyncInterval = async (): Promise<boolean> => {
    setSyncIntervalStatus("loading");
    const response = await authFetch("/api/settings/desk-sync-interval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify({
        intervalMinutes: syncIntervalMinutes,
        dailyTimeUtc: brasiliaTimeToUtc(dailySyncTimeBrasilia),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as SyncIntervalResponse;
    if (!response.ok) {
      setSyncIntervalStatus("error");
      setSyncIntervalMessage(data.error || "Falha ao salvar frequência.");
      return false;
    }
    if (typeof data.intervalMinutes === "number") setSyncIntervalMinutes(data.intervalMinutes);
    if (typeof data.dailyTimeUtc === "string" && data.dailyTimeUtc.trim()) {
      setDailySyncTimeBrasilia(utcTimeToBrasilia(data.dailyTimeUtc));
    }
    setSyncIntervalStatus("success");
    setSyncIntervalMessage("Frequência salva.");
    return true;
  };

  const handleSaveAutomationSettings = async () => {
    setSqlStatus("loading");
    setSqlMessage("");
    setSyncIntervalStatus("loading");
    setSyncIntervalMessage("");
    const [sqlOk, syncOk] = await Promise.all([saveSqlMarkers(), saveSyncInterval()]);
    if (syncOk && sqlOk) {
      setSqlMessage("Marcadores e frequência salvos.");
      return;
    }
    if (!syncOk && !sqlOk) {
      setSqlMessage("Falha ao salvar marcadores e frequência.");
      return;
    }
    if (!syncOk) {
      setSqlMessage("Marcadores salvos, mas a frequência falhou.");
      return;
    }
    setSqlMessage("Frequência salva, mas os marcadores falharam.");
  };

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Desk de atendimento</CardTitle>
        <CardDescription>
          Selecione o provedor e configure as credenciais da API. A rota de webhooks permanece disponível para consulta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {configured !== null && (
          <p className="text-sm">
            Status:{" "}
            <span className={configured ? "text-[var(--accent)] font-medium" : "text-amber-600 dark:text-amber-400"}>
              {configured ? "Configurado" : "Não configurado"}
            </span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="desk-provider">Provedor</Label>
          <Select
            id="desk-provider"
            value={providerId}
            onValueChange={(next) => setProviderId(next as DeskProviderId)}
            options={DESK_PROVIDER_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
              icon: option.id === "octadesk" ? <OctaDeskLogo className="translate-y-[1px]" /> : undefined,
            }))}
          />
        </div>

        {isEditingConnection ? (
          <>
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
                Token já configurado neste tenant. Preencha novamente para rotacionar.
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
              {configured && (
                <Button type="button" variant="outline" onClick={() => setIsEditingConnection(false)}>
                  Cancelar
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={testStatus === "loading"}
                onClick={() => void handleTestConnection()}
              >
                {testStatus === "loading" ? "Testando..." : "Testar conexão"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setIsEditingConnection(true)}>
              Editar conexão
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testStatus === "loading"}
              onClick={() => void handleTestConnection()}
            >
              {testStatus === "loading" ? "Testando..." : "Testar conexão"}
            </Button>
          </div>
        )}

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

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Frequência de sincronização</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Define o intervalo mínimo entre rodadas automáticas de sincronização.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <Select
                disabled={syncIntervalOptions.length <= 1}
                value={String(syncIntervalMinutes)}
                onValueChange={(next) => {
                  const n = Number.parseInt(next, 10);
                  if (Number.isNaN(n)) return;
                  setSyncIntervalMinutes(n);
                }}
                options={syncIntervalOptions.map((m) => ({
                  value: String(m),
                  label: m === 1440 ? "Diário" : m >= 60 ? `${m / 60}h` : `${m} min`,
                }))}
              />
            </div>
            {syncIntervalMinutes === 1440 && (
              <div className="w-full max-w-xs space-y-1">
                <Label htmlFor="daily-sync-time">Horário diário (Brasília)</Label>
                <Input
                  id="daily-sync-time"
                  type="text"
                  inputMode="numeric"
                  pattern="^([01]\\d|2[0-3]):([0-5]\\d)$"
                  placeholder="00:00"
                  value={dailySyncTimeBrasilia}
                  onChange={(event) => {
                    const normalized = normalize24hTimeInput(event.target.value);
                    if (!normalized && event.target.value.trim()) return;
                    setDailySyncTimeBrasilia(normalized || "00:00");
                  }}
                />
                <p className="text-xs text-[var(--muted-foreground)]">Formato 24h (HH:mm), ex.: 00:00, 03:30, 21:45</p>
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            No plano Free da Vercel, a frequência está fixada em <strong className="text-[var(--foreground)]">Diário</strong>.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Marcadores de SQL</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Digite um marcador e clique em Adicionar. Os itens abaixo são usados para identificar SQL no lead/webhook/import.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={sqlDraft}
              onChange={(event) => setSqlDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSqlMarker();
                }
              }}
              placeholder="Ex.: Oportunidade criada"
              className="max-w-md"
            />
            <Button type="button" variant="outline" onClick={addSqlMarker}>
              Adicionar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {sqlMarkers.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Nenhum marcador adicionado.</p>
            ) : (
              sqlMarkers.map((marker) => (
                <span
                  key={marker}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs"
                >
                  <span>{marker}</span>
                  <button
                    type="button"
                    className="text-[var(--muted-foreground)] hover:text-red-600"
                    onClick={() => removeSqlMarker(marker)}
                    aria-label={`Remover marcador ${marker}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {sqlCustomized ? "Lista customizada para esta empresa." : "Usando padrão do sistema."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={sqlStatus === "loading" || syncIntervalStatus === "loading"}
              onClick={() => void handleSaveAutomationSettings()}
            >
              {sqlStatus === "loading" || syncIntervalStatus === "loading" ? "Salvando..." : "Salvar configurações"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={sqlStatus === "loading"} onClick={restoreSqlDefaults}>
              Restaurar padrão
            </Button>
          </div>
          {sqlMessage && (
            <p className={`text-xs ${sqlStatus === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--accent)]"}`}>
              {sqlMessage}
            </p>
          )}
          {syncIntervalMessage && (
            <p
              className={`text-xs ${
                syncIntervalStatus === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--accent)]"
              }`}
            >
              {syncIntervalMessage}
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
