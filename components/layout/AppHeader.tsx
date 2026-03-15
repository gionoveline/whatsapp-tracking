"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/", label: "Início" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/configuracoes", label: "Configurações" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-[var(--background)]/90 backdrop-blur-md shadow-sm transition-colors duration-300">
      <div className="mx-auto max-w-6xl px-6 py-3.5 sm:px-8 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-[var(--foreground)] hover:opacity-80 transition-opacity"
        >
          WhatsApp Tracking
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {nav.map(({ href, label }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
