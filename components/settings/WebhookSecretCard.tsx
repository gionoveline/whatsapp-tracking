"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/client-auth";

type SaveResponse = {
  configured?: boolean;
  secret?: string;
  error?: string;
};

export function WebhookSecretCard({ partnerId }: { partnerId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!partnerId) return;
      setConfigured(null);
      const res = await authFetch("/api/settings/webhook-secret", { partnerId });
      const data = await res.json().catch(() => ({}));
      setConfigured(data.configured === true);
    };
    void load();
  }, [partnerId]);

  const saveSecret = async (payload: { secret?: string; generate?: boolean }) => {
    setStatus("loading");
    setMessage("");
    setGeneratedSecret("");

    const res = await authFetch("/api/settings/webhook-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      partnerId,
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as SaveResponse;
    if (!res.ok) {
      setStatus("error");
      setMessage(data.error || "Erro ao salvar token do webhook.");
      return;
    }

    setConfigured(data.configured === true);
    setStatus("success");
    if (data.secret) {
      setGeneratedSecret(data.secret);
      setSecretInput("");
      setMessage("Token gerado e salvo. Copie agora: ele nao sera exibido novamente.");
      return;
    }

    setSecretInput("");
    setMessage("Token salvo com sucesso.");
  };

  const handleCopy = async () => {
    if (!generatedSecret) return;
    await navigator.clipboard.writeText(generatedSecret).catch(() => null);
    setMessage("Token copiado para a area de transferencia.");
  };

  return (
    <Card className="rounded-2xl border-[var(--border)] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-lg">Token do webhook</CardTitle>
        <CardDescription>
          Use este token no header <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs font-mono">x-webhook-secret</code> (ou{" "}
          <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs font-mono">Authorization: Bearer</code>) para autenticar as chamadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {configured !== null && (
          <p className="text-sm">
            Status:{" "}
            <span className={configured ? "text-[var(--accent)] font-medium" : "text-amber-600 dark:text-amber-400"}>
              {configured ? "Configurado" : "Nao configurado"}
            </span>
          </p>
        )}

        <div className="grid gap-2">
          <Label htmlFor="webhook-secret">Definir token manualmente</Label>
          <Input
            id="webhook-secret"
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            className="font-mono"
            placeholder="Digite um token forte (32+ caracteres)"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={status === "loading" || secretInput.trim().length < 32}
              className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
              onClick={() => void saveSecret({ secret: secretInput.trim() })}
            >
              {status === "loading" ? "Salvando..." : "Salvar token"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={status === "loading"}
              onClick={() => void saveSecret({ generate: true })}
            >
              Gerar token automatico
            </Button>
          </div>
        </div>

        {generatedSecret && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3 space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              Exibicao unica: copie o token agora e armazene em local seguro.
            </p>
            <pre className="overflow-x-auto rounded-md bg-[var(--card)] px-3 py-2 text-xs font-mono">{generatedSecret}</pre>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
              Copiar token
            </Button>
          </div>
        )}

        {message && (
          <p className={`text-sm ${status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--accent)]"}`}>{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
