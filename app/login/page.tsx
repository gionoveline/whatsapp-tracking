"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      router.push("/dashboard");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao redirecionar para o dashboard"
      );
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h1 className="font-display text-xl font-semibold mb-2">
          Entrar no WhatsApp Tracking
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          Acesse o dashboard e as configurações do WhatsApp Tracking.
        </p>
        <Button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90"
        >
          {loading ? "Redirecionando..." : "Entrar com Google"}
        </Button>
        {error && (
          <p className="mt-4 text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}

