"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ConfiguracoesPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings/meta-token")
      .then((r) => r.json())
      .then((data) => setConfigured(data.configured === true))
      .catch(() => setConfigured(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const res = await fetch("/api/settings/meta-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus("success");
      setConfigured(true);
      setToken("");
      setMessage("Token Meta salvo com sucesso.");
    } else {
      setStatus("error");
      setMessage(data.error || "Erro ao salvar.");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-8">
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
          Conectar Meta
        </h1>

        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Token da Marketing API</CardTitle>
            <CardDescription>
              O token é usado para enriquecer os leads com nome da campanha, conjunto de anúncios e anúncio. Use um token com permissão{" "}
              <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs font-mono">ads_read</code> (e{" "}
              <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs font-mono">whatsapp_business_manage_events</code> se for usar conversões).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configured !== null && (
              <p className="text-sm">
                Status:{" "}
                <span className={configured ? "text-[var(--accent)] font-medium" : "text-amber-600 dark:text-amber-400"}>
                  {configured ? "Configurado" : "Não configurado"}
                </span>
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Token de acesso Meta</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono"
                  placeholder="Cole o token da Marketing API"
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                disabled={status === "loading"}
                className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
              >
                {status === "loading" ? "Salvando…" : "Salvar token"}
              </Button>
            </form>
            {message && (
              <p className={`text-sm ${status === "success" ? "text-[var(--accent)]" : "text-red-600 dark:text-red-400"}`}>
                {message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[var(--border)] bg-[var(--muted)]/30 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="font-display text-lg">Envio de conversões para a Meta</CardTitle>
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                Beta
              </span>
            </div>
            <CardDescription>
              Envie eventos Lead, SQL e Venda para a Meta para otimização das campanhas (Conversions API for Business Messaging).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/configuracoes/conversoes"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline underline-offset-2"
            >
              Configurar conversões →
            </Link>
          </CardContent>
        </Card>

        <p className="text-sm text-[var(--muted-foreground)]">
          <Link href="/" className="text-[var(--accent)] hover:underline underline-offset-2">← Voltar ao início</Link>
        </p>
      </div>
    </main>
  );
}
