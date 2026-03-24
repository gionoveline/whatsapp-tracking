"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { authFetch, getClientAuth } from "@/lib/client-auth";

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [autoLinkByDomain, setAutoLinkByDomain] = useState(true);
  const [emailDomain, setEmailDomain] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const check = async () => {
      const auth = await getClientAuth();
      if (!auth) {
        router.replace("/login");
        return;
      }

      const res = await authFetch("/api/auth/session");
      const json = await res.json().catch(() => ({}));
      const email = typeof json?.user?.email === "string" ? json.user.email.toLowerCase() : "";
      const domain = email.includes("@") ? email.split("@").pop() ?? "" : "";
      setEmailDomain(domain);
      const isGlobalAdmin = json?.user?.is_global_admin === true;
      const partners: Array<{ id: string; name: string }> = Array.isArray(json.partners) ? json.partners : [];
      if (!isGlobalAdmin && partners.length > 0) {
        const activePartnerId = localStorage.getItem("active_partner_id") ?? "";
        const hasActivePartner = activePartnerId && partners.some((p) => p.id === activePartnerId);
        if (!hasActivePartner) {
          localStorage.setItem("active_partner_id", partners[0].id);
        }
        router.replace("/");
      }
    };
    void check();
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const name = companyName.trim();
    if (name.length < 2) {
      setStatus("error");
      setMessage("Informe um nome de empresa com pelo menos 2 caracteres.");
      return;
    }

    try {
      const res = await authFetch("/api/onboarding/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: name,
          logoDataUrl: logoDataUrl || undefined,
          autoLinkByDomain,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Nao foi possivel criar a empresa.");
        return;
      }

      if (data?.partner?.id) {
        localStorage.setItem("active_partner_id", data.partner.id);
      }
      router.replace("/?company_created=1");
    } catch {
      setStatus("error");
      setMessage("Erro inesperado ao criar empresa.");
    } finally {
      setStatus((prev) => (prev === "error" ? "error" : "idle"));
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] bg-grain">
      <div className="mx-auto max-w-xl p-6 sm:p-8">
        <Card className="rounded-2xl border-[var(--border)] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-xl">Primeiro acesso</CardTitle>
            <CardDescription>
              Antes de continuar, crie a empresa que voce quer gerenciar no WhatsApp Tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da empresa</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Eu Medico Residente"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyLogo">Logo da empresa (opcional)</Label>
                <input
                  ref={fileInputRef}
                  id="companyLogo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setLogoDataUrl("");
                      return;
                    }
                    if (!file.type.startsWith("image/")) {
                      setStatus("error");
                      setMessage("Selecione um arquivo de imagem valido.");
                      return;
                    }
                    if (file.size > 1_000_000) {
                      setStatus("error");
                      setMessage("A logo deve ter no maximo 1MB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === "string" ? reader.result : "";
                      setLogoDataUrl(result);
                      setMessage("");
                      setStatus("idle");
                    };
                    reader.onerror = () => {
                      setStatus("error");
                      setMessage("Nao foi possivel ler a imagem selecionada.");
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <Card className="border-dashed">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      {logoDataUrl ? (
                        <img
                          src={logoDataUrl}
                          alt="Previa da logo da empresa"
                          className="h-14 w-14 rounded-md border border-[var(--border)] object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]/50">
                          <ImagePlus className="h-5 w-5 text-[var(--muted-foreground)]" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {logoDataUrl ? "Logo selecionada" : "Nenhuma logo selecionada"}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          PNG, JPG ou WEBP (maximo 1MB)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {logoDataUrl ? "Trocar" : "Escolher"}
                      </Button>
                      {logoDataUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setLogoDataUrl("");
                            if (fileInputRef.current) {
                              fileInputRef.current.value = "";
                            }
                          }}
                          aria-label="Remover logo selecionada"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <Checkbox
                  checked={autoLinkByDomain}
                  onCheckedChange={(checked) => setAutoLinkByDomain(checked === true)}
                />
                <span className="text-sm text-[var(--foreground)]">
                  Vincular automaticamente emails deste dominio
                  {emailDomain ? ` (@${emailDomain})` : ""}.
                </span>
              </label>
              <Button
                type="submit"
                disabled={status === "loading"}
                className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
              >
                {status === "loading" ? "Criando..." : "Criar empresa"}
              </Button>
              {message && <p className="text-sm text-red-600 dark:text-red-400">{message}</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
