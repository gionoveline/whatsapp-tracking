"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getClientAuth, authFetch } from "@/lib/client-auth";
import { supabaseClient } from "@/lib/supabaseClient";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/configuracoes", label: "Configurações" },
];

type PartnerItem = {
  id: string;
  name: string;
  slug?: string | null;
  logo_url?: string | null;
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [isLogged, setIsLogged] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [isPartnerMenuOpen, setIsPartnerMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const partnerMenuRef = useRef<HTMLDivElement | null>(null);

  const activePartner = useMemo(
    () => partners.find((partner) => partner.id === partnerId) ?? partners[0] ?? null,
    [partnerId, partners]
  );

  const applyPartnerSelection = (nextPartnerId: string) => {
    setPartnerId(nextPartnerId);
    localStorage.setItem("active_partner_id", nextPartnerId);
    window.dispatchEvent(new CustomEvent("partner-changed", { detail: { partnerId: nextPartnerId } }));
    setIsPartnerMenuOpen(false);
    if (isGlobalAdmin) {
      // Super admin troca de tenant com refresh imediato da tela atual.
      router.replace(pathname || "/");
      router.refresh();
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setAuthResolved(false);
      const auth = await getClientAuth();
      if (!mounted) return;
      if (!auth) {
        setIsLogged(false);
        setIsGlobalAdmin(false);
        setNeedsOnboarding(false);
        setPartners([]);
        setAuthResolved(true);
        return;
      }

      await fetch("/api/auth/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: auth.accessToken }),
      }).catch(() => null);

      setIsLogged(true);
      const res = await authFetch("/api/auth/session");
      if (!res.ok) {
        setIsLogged(false);
        setIsGlobalAdmin(false);
        setNeedsOnboarding(false);
        setPartners([]);
        setAuthResolved(true);
        return;
      }
      const data = await res.json();
      setIsGlobalAdmin(data?.user?.is_global_admin === true);
      setNeedsOnboarding(data?.needs_onboarding === true);
      const items: PartnerItem[] = Array.isArray(data.partners)
        ? data.partners.map((p: { id: string; name: string; slug?: string | null; logo_url?: string | null }) => ({
            id: p.id,
            name: p.name,
            slug: p.slug ?? null,
            logo_url: p.logo_url ?? null,
          }))
        : [];
      setPartners(items);

      const current = localStorage.getItem("active_partner_id");
      const fallback = items[0]?.id ?? "";
      const next = current && items.some((p) => p.id === current) ? current : fallback;
      if (next) {
        localStorage.setItem("active_partner_id", next);
        setPartnerId(next);
      }
      setAuthResolved(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const menu = partnerMenuRef.current;
      if (!menu) return;
      if (event.target instanceof Node && !menu.contains(event.target)) {
        setIsPartnerMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsPartnerMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-[var(--background)]/90 backdrop-blur-md shadow-sm transition-colors duration-300">
      <div className="mx-auto max-w-6xl px-6 py-3.5 sm:px-8 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-[var(--foreground)] hover:opacity-80 transition-opacity inline-flex items-center gap-2"
        >
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/3840px-WhatsApp.svg.png"
            alt="Logo do WhatsApp"
            className="h-6 w-6"
          />
          <span>WhatsApp Tracking</span>
        </Link>
        <nav className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {!authResolved ? (
            <div className="h-9 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)]/60" aria-hidden />
          ) : (
            <>
              {isLogged && (partners.length > 0 || isGlobalAdmin) && (
                <div className="relative" ref={partnerMenuRef}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="max-w-56 justify-between gap-2"
                    aria-haspopup="listbox"
                    aria-expanded={isPartnerMenuOpen}
                    aria-label="Selecionar empresa"
                    onClick={() => setIsPartnerMenuOpen((prev) => !prev)}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {activePartner?.logo_url ? (
                        <img
                          src={activePartner.logo_url}
                          alt={`Logo da empresa ${activePartner.name}`}
                          className="h-6 w-6 rounded-full border border-zinc-200 object-cover shadow-sm dark:border-zinc-700"
                        />
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-semibold uppercase text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                          {activePartner?.name?.[0] ?? "E"}
                        </span>
                      )}
                      <span className="truncate">{activePartner?.name ?? "Selecionar empresa"}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </Button>
                  {isPartnerMenuOpen && (
                    <Card className="absolute right-0 top-11 z-50 w-64 p-1">
                      <ul role="listbox" aria-label="Lista de empresas" className="space-y-1">
                        {partners.map((partner) => {
                          const isActive = partner.id === activePartner?.id;
                          return (
                            <li key={partner.id}>
                              <Button
                                type="button"
                                variant={isActive ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-between"
                                onClick={() => applyPartnerSelection(partner.id)}
                              >
                                <span className="flex items-center gap-2 truncate">
                                  {partner.logo_url ? (
                                    <img
                                      src={partner.logo_url}
                                      alt={`Logo da empresa ${partner.name}`}
                                      className="h-6 w-6 rounded-full border border-zinc-200 object-cover shadow-sm dark:border-zinc-700"
                                    />
                                  ) : (
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-semibold uppercase text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                                      {partner.name[0]}
                                    </span>
                                  )}
                                  <span className="truncate">{partner.name}</span>
                                </span>
                                {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                              </Button>
                            </li>
                          );
                        })}
                        {isGlobalAdmin && (
                          <>
                            <li role="separator" className="my-1 border-t border-[var(--border)]" />
                            <li>
                              <Link
                                href="/primeiro-acesso"
                                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/60"
                                onClick={() => setIsPartnerMenuOpen(false)}
                              >
                                Nova empresa
                              </Link>
                            </li>
                          </>
                        )}
                      </ul>
                    </Card>
                  )}
                </div>
              )}
              {isLogged && !isGlobalAdmin && needsOnboarding && (
                <Link
                  href="/primeiro-acesso"
                  className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/50"
                >
                  Criar empresa
                </Link>
              )}
              {nav.map(({ href, label }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] dark:bg-[var(--accent)]/20"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
              {isLogged ? (
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  onClick={async () => {
                    await supabaseClient.auth.signOut();
                    await fetch("/api/auth/cookie", { method: "DELETE" });
                    localStorage.removeItem("active_partner_id");
                    window.location.href = "/login";
                  }}
                >
                  Sair
                </button>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  Entrar
                </Link>
              )}
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 w-9 p-0"
            aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur px-4 pb-4 pt-3">
          {!authResolved ? (
            <div className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--card)]/60" aria-hidden />
          ) : (
            <div className="space-y-2">
              {isLogged && (partners.length > 0 || isGlobalAdmin) && (
                <Card className="p-2 space-y-1">
                  {partners.map((partner) => {
                    const isActive = partner.id === activePartner?.id;
                    return (
                      <Button
                        key={partner.id}
                        type="button"
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => applyPartnerSelection(partner.id)}
                      >
                        <span className="truncate text-left">{partner.name}</span>
                        {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                      </Button>
                    );
                  })}
                  {isGlobalAdmin && (
                    <Link
                      href="/primeiro-acesso"
                      className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/60"
                    >
                      Nova empresa
                    </Link>
                  )}
                </Card>
              )}

              {isLogged && !isGlobalAdmin && needsOnboarding && (
                <Link
                  href="/primeiro-acesso"
                  className="block w-full px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/50"
                >
                  Criar empresa
                </Link>
              )}

              {nav.map(({ href, label }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    className={`block w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] dark:bg-[var(--accent)]/20"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}

              {isLogged ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 rounded-lg text-left text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  onClick={async () => {
                    await supabaseClient.auth.signOut();
                    await fetch("/api/auth/cookie", { method: "DELETE" });
                    localStorage.removeItem("active_partner_id");
                    window.location.href = "/login";
                  }}
                >
                  Sair
                </button>
              ) : (
                <Link
                  href="/login"
                  className="block w-full px-3 py-2 rounded-lg text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  Entrar
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
