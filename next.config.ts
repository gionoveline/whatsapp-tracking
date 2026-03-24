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
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
