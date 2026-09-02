import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Shape of `config/networks.<network>.json` (deploy output). */
export interface RawNetworkFile {
  readonly network?: string;
  readonly contracts?: Record<string, { id?: string }>;
  readonly external?: {
    readonly usdcSacId?: string | null;
    readonly settlementSymbol?: string | null;
    readonly demoMode?: boolean;
    readonly kaidoIssuer?: string | null;
    readonly reflectorFeedId?: string | null;
    readonly adminAddress?: string | null;
  };
  readonly fixtures?: Record<string, string | undefined>;
}

/** Candidate paths for the live deploy file (monorepo root + Vercel web-only root). */
export function networkConfigPaths(network: string): string[] {
  const name = `networks.${network}.json`;
  const cwd = process.cwd();
  return [
    join(cwd, "config", name),
    join(cwd, "..", "config", name),
    join(cwd, "..", "..", "config", name),
  ];
}

export function readNetworkConfigFile(network: string): RawNetworkFile | null {
  for (const file of networkConfigPaths(network)) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as RawNetworkFile;
    } catch {
      /* try next path */
    }
  }
  return null;
}
