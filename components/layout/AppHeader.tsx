"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur transition-colors duration-300 ease-in-out">
      <div className="mx-auto max-w-6xl px-6 py-3 sm:px-8 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          WhatsApp Tracking
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
