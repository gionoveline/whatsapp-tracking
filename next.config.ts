import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Evita problemas de readlink no Windows/OneDrive com caminhos especiais
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    "*": [".next/cache/**"],
  },
};

export default nextConfig;
