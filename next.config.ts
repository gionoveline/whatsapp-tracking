import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Ajuda o bundler com pacotes ESM (evita erros raros de módulo no runtime)
  transpilePackages: ["@supabase/supabase-js"],
  // Evita problemas de readlink no Windows/OneDrive com caminhos especiais
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    "*": [".next/cache/**"],
  },
  async headers() {
    // DENY quebra preview embutido em iframe (ex.: Simple Browser do Cursor em localhost).
    // Mantemos apenas em produção; em dev use navegador externo ou o preview sem XFO.
    const shared = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
    ] as const;
    const prodOnly =
      process.env.NODE_ENV === "production"
        ? ([{ key: "X-Frame-Options", value: "DENY" }] as const)
        : [];
    return [
      {
        source: "/(.*)",
        headers: [...prodOnly, ...shared],
      },
    ];
  },
};

export default nextConfig;
