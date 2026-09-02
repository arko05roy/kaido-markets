import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler is stable in Next 16 (build.md ADR-10). Requires
  // `babel-plugin-react-compiler` (a devDependency).
  reactCompiler: true,

  // `passkey-kit` (and `passkey-kit-sdk`) publish raw TypeScript as their entry
  // point — Turbopack/Next won't load `.ts` from node_modules without being
  // told to transpile the package. (The connector is also only ever imported in
  // client components, so it never enters the server bundle.)
  transpilePackages: ["passkey-kit", "passkey-kit-sdk", "@kaido/sdk", "@kaido/contract-bindings"],

  // Network params (passphrases, RPC URLs) are loaded from config/networks.json
  // via lib/stellar/networks.ts — nothing network-specific is hardcoded here.
};

export default nextConfig;
