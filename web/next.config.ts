import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler is stable in Next 16 (build.md ADR-10). Requires
  // `babel-plugin-react-compiler` (a devDependency).
  reactCompiler: true,

  // Local workspace packages publish source TS; transpile them through Next.
  transpilePackages: ["@kaido/sdk", "@kaido/contract-bindings"],

  // Network params (passphrases, RPC URLs) are loaded from config/networks.json
  // via lib/stellar/networks.ts — nothing network-specific is hardcoded here.
};

export default nextConfig;
