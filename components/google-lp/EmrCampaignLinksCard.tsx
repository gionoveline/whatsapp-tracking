"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";
import { CopyableGoLinkField } from "@/components/google-lp/CopyableGoLinkField";
import { useGoogleAdsAccountOptions, type GoogleAdsAccountItem } from "@/components/google-ads/GoogleAdsAccountsCard";
import { Select } from "@/components/ui/select";
import {
  buildGoogleLpGoUrl,
  buildGoogleWciUrl,
  sanitizeEmrCampaignId,
  type GoogleLpCampaignLinkWithGoUrl,
} from "@/lib/google-lp-campaign-links";

type Props = {
  partnerId: string;
  scriptOrigin: string;
};

export function EmrCampaignLinksCard({ partnerId, scriptOrigin }: Props) {
  const [campaigns, setCampaigns] = useState<GoogleLpCampaignLinkWithGoUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [emrInput, setEmrInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ emrCampaignId: string; goUrl: string; wciUrl: string } | null>(
    null
  );

  const parsedEmrId = useMemo(() => sanitizeEmrCampaignId(emrInput), [emrInput]);
  const { accounts: googleAccounts, loading: loadingGoogleAccounts } = useGoogleAdsAccountOptions(partnerId);

  const previewGoUrl = useMemo(() => {
    if (!scriptOrigin || !partnerId || !parsedEmrId) return "";
    return buildGoogleLpGoUrl(scriptOrigin, partnerId, parsedEmrId);
  }, [scriptOrigin, partnerId, parsedEmrId]);

  const load = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/settings/google-lp-campaigns", { partnerId });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar campanhas");
      setCampaigns((data.campaigns as GoogleLpCampaignLinkWithGoUrl[]) ?? []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (text: string, rowId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (rowId) {
        setCopyId(rowId);
        setTimeout(() => setCopyId(null), 2000);
      }
    } catch {
      setMessage("Não foi possível copiar.");
      setStatus("error");
    }
  };

  const handleAdd = async () => {
    if (!parsedEmrId) {
      setStatus("error");
      setMessage("Informe um ID válido (ex.: ID00111 ou ID#00111).");
      return;
    }
    setStatus("loading");
    setMessage("");
    setLastCreated(null);
    try {
      const res = await authFetch("/api/settings/google-lp-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        partnerId,
        body: JSON.stringify({
          emrCampaignId: parsedEmrId,
          label: labelInput.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao cadastrar");

      const created = data.campaign as GoogleLpCampaignLinkWithGoUrl | undefined;
      const goUrl =
        created?.go_url ||
        (scriptOrigin ? buildGoogleLpGoUrl(scriptOrigin, partnerId, parsedEmrId) : "");
      const wciUrl =
        created?.wci_url ||
        (scriptOrigin ? buildGoogleWciUrl(scriptOrigin, partnerId, parsedEmrId) : "");
      setLastCreated({ emrCampaignId: parsedEmrId, goUrl, wciUrl });
      setEmrInput("");
      setLabelInput("");
      setStatus("success");
      setMessage("Campanha cadastrada. Use o link exclusivo abaixo no Google Ads.");
      if (goUrl) await copyText(goUrl);
      await load();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Erro ao cadastrar");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/settings/google-lp-campaigns?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        partnerId,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao remover");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro ao remover");
      setStatus("error");
    }
  };

  const handleAccountChange = async (campaignId: string, googleAdsAccountId: string) => {
    try {
      const res = await authFetch("/api/settings/google-lp-campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        partnerId,
        body: JSON.stringify({
          id: campaignId,
          googleAdsAccountId: googleAdsAccountId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar conta");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro ao atualizar conta Google");
      setStatus("error");
    }
  };

  const copyAllLinks = async () => {
    if (!scriptOrigin || campaigns.length === 0) return;
    const lines = campaigns.map((c) => {
      const label = c.label ? `${c.label} — ` : "";
      const goUrl = c.go_url || buildGoogleLpGoUrl(scriptOrigin, partnerId, c.emr_campaign_id);
      const wciUrl = c.wci_url || buildGoogleWciUrl(scriptOrigin, partnerId, c.emr_campaign_id);
      return `${label}${c.emr_campaign_id}\nLanding: ${goUrl}\nWCI: ${wciUrl}`;
    });
    await copyText(lines.join("\n\n"));
    setCopyId("__all__");
    setTimeout(() => setCopyId(null), 2000);
  };

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Campanhas EMR — um link por ID</CardTitle>
        <CardDescription>
          Cada ID da EMR (ex.: <code className="text-xs">ID#00111</code>) gera um link exclusivo para colar na{" "}
          <strong className="text-[var(--foreground)]">URL final</strong> do Google Ads. A mensagem no WhatsApp
          fica <code className="text-xs">ID#00111 - GLP-…</code> com gclid rastreado. Opcionalmente vincule cada ID à
          conta Google Ads onde o anúncio roda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3">
          Se a landing usar botões com link <code className="text-xs bg-[var(--muted)] px-1 rounded">/go</code>, mantenha
          o script <code className="text-xs bg-[var(--muted)] px-1 rounded">wt-google-lp.js</code> no GTM — ele repassa{" "}
          <code className="text-xs">gclid</code> (URL ou cookie <code className="text-xs">_gcl_aw</code> do Google) para
          o redirect.
        </p>
        <EmrAddForm
          emrInput={emrInput}
          labelInput={labelInput}
          parsedEmrId={parsedEmrId}
          previewGoUrl={previewGoUrl}
          onEmrChange={setEmrInput}
          onLabelChange={setLabelInput}
          onSubmit={() => void handleAdd()}
          loading={status === "loading"}
        />

        {message && (
          <p
            className={`text-sm ${status === "success" ? "text-[var(--accent)]" : status === "error" ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {message}
          </p>
        )}

        {lastCreated?.goUrl && (
          <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4 space-y-3">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Links gerados para <span className="font-mono">{lastCreated.emrCampaignId}</span>
            </p>
            <CopyableGoLinkField
              url={lastCreated.goUrl}
              label="Landing (/go)"
              inputId={`go-link-new-${lastCreated.emrCampaignId}`}
            />
            {lastCreated.wciUrl && (
              <CopyableGoLinkField
                url={lastCreated.wciUrl}
                label="Extensão WhatsApp WCI (/wci)"
                inputId={`wci-link-new-${lastCreated.emrCampaignId}`}
              />
            )}
          </div>
        )}

        {loading && <p className="text-sm text-[var(--muted-foreground)]">Carregando campanhas…</p>}

        {!loading && campaigns.length > 0 && (
          <div className="space-y-3">
            <EmrListHeader onCopyAll={() => void copyAllLinks()} copyAllDone={copyId === "__all__"} />
            <ul className="space-y-3">
              {campaigns.map((c) => (
                <CampaignRowItem
                  key={c.id}
                  campaign={c}
                  scriptOrigin={scriptOrigin}
                  partnerId={partnerId}
                  googleAccounts={googleAccounts}
                  loadingGoogleAccounts={loadingGoogleAccounts}
                  onAccountChange={(accountId) => void handleAccountChange(c.id, accountId)}
                  onDelete={() => void handleDelete(c.id)}
                />
              ))}
            </ul>
          </div>
        )}

        {!loading && campaigns.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhuma campanha ainda. Cadastre o primeiro ID para gerar o link do Google Ads.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmrAddForm({
  emrInput,
  labelInput,
  parsedEmrId,
  previewGoUrl,
  onEmrChange,
  onLabelChange,
  onSubmit,
  loading,
}: {
  emrInput: string;
  labelInput: string;
  parsedEmrId: string | null;
  previewGoUrl: string;
  onEmrChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4">
      <p className="text-sm font-medium text-[var(--foreground)]">Nova campanha</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="emr-campaign-id">ID da campanha EMR</Label>
          <Input
            id="emr-campaign-id"
            value={emrInput}
            onChange={(e) => onEmrChange(e.target.value)}
            className="font-mono text-sm"
            placeholder="ID00111"
            spellCheck={false}
          />
          {emrInput.trim() && !parsedEmrId && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Formato esperado: <code className="bg-[var(--muted)] px-1 rounded">ID</code> seguido de letras/números
              (ex. ID00111; o <code className="bg-[var(--muted)] px-1 rounded">#</code> é opcional).
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="emr-label">Nome interno (opcional)</Label>
          <Input
            id="emr-label"
            value={labelInput}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Google Search — marca"
          />
        </div>
        </div>

      {previewGoUrl && (
        <CopyableGoLinkField
          url={previewGoUrl}
          label="Prévia do link (válido após cadastrar)"
          inputId="go-link-preview"
          emptyHint=""
        />
      )}

      <Button
        type="button"
        className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
        disabled={loading || !parsedEmrId}
        onClick={onSubmit}
      >
        {loading ? "Gerando…" : "Cadastrar e gerar link"}
      </Button>
    </div>
  );
}

function EmrListHeader({
  onCopyAll,
  copyAllDone,
}: {
  onCopyAll: () => void;
  copyAllDone: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-[var(--foreground)]">Links por campanha</p>
      <Button type="button" variant="outline" size="sm" onClick={onCopyAll}>
        {copyAllDone ? "Copiado" : "Copiar todos os links"}
      </Button>
    </div>
  );
}

function CampaignRowItem({
  campaign,
  scriptOrigin,
  partnerId,
  googleAccounts,
  loadingGoogleAccounts,
  onAccountChange,
  onDelete,
}: {
  campaign: GoogleLpCampaignLinkWithGoUrl;
  scriptOrigin: string;
  partnerId: string;
  googleAccounts: GoogleAdsAccountItem[];
  loadingGoogleAccounts: boolean;
  onAccountChange: (accountId: string) => void;
  onDelete: () => void;
}) {
  const goUrl =
    campaign.go_url ||
    (scriptOrigin ? buildGoogleLpGoUrl(scriptOrigin, partnerId, campaign.emr_campaign_id) : "");
  const wciUrl =
    campaign.wci_url ||
    (scriptOrigin ? buildGoogleWciUrl(scriptOrigin, partnerId, campaign.emr_campaign_id) : "");

  const accountOptions = [
    { value: "", label: "Conta padrão" },
    ...googleAccounts.map((a) => ({
      value: a.id,
      label: `${a.label}${a.is_default ? " (padrão)" : ""} · ${a.customer_id}`,
    })),
  ];

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3 list-none shadow-sm">
      <CampaignTitle campaign={campaign} />
      {googleAccounts.length > 0 && (
        <div className="space-y-2 max-w-md">
          <Label htmlFor={`ga-account-${campaign.id}`}>Conta Google Ads</Label>
          <Select
            id={`ga-account-${campaign.id}`}
            value={campaign.google_ads_account_id ?? ""}
            onValueChange={onAccountChange}
            options={accountOptions}
            disabled={loadingGoogleAccounts}
          />
        </div>
      )}
      <CopyableGoLinkField
        url={goUrl}
        label="Landing Google LP (/go)"
        inputId={`go-link-${campaign.id}`}
        emptyHint="Defina NEXT_PUBLIC_SITE_URL ou acesse pelo domínio do app para montar o link."
      />
      {wciUrl && (
        <CopyableGoLinkField
          url={wciUrl}
          label="Extensão WhatsApp WCI (/wci)"
          inputId={`wci-link-${campaign.id}`}
          emptyHint=""
        />
      )}
      <Button type="button" variant="outline" size="sm" onClick={onDelete}>
        Remover
      </Button>
    </li>
  );
}

function CampaignTitle({ campaign }: { campaign: GoogleLpCampaignLinkWithGoUrl }) {
  return (
    <div>
      <span className="font-mono text-base font-semibold text-[var(--foreground)]">{campaign.emr_campaign_id}</span>
      {campaign.label && (
        <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{campaign.label}</p>
      )}
    </div>
  );
}
