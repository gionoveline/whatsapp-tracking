"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AppHeaderLazy = dynamic(
  () => import("./AppHeader").then((mod) => ({ default: mod.AppHeader })),
  { ssr: true }
);

function shouldHideHeader(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

/**
 * Evita carregar o bundle pesado do header (lucide, parceiros, authFetch) nas
 * rotas de login/OAuth, onde isso pode competir com o fluxo do Supabase e, em
 * alguns deploys, contribuir para erros de chunk do Webpack.
 */
export function ConditionalAppHeader() {
  const pathname = usePathname();
  if (shouldHideHeader(pathname)) return null;
  return <AppHeaderLazy />;
}
