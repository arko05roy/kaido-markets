/** Freighter connector — `@stellar/freighter-api`. Power-user fallback. */
import {
  isAllowed,
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

import type { ConnectedWallet, WalletConnector } from "./types";

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function buildWallet(accountId: string, networkPassphrase: string): ConnectedWallet {
  return {
    kind: "freighter",
    accountId,
    label: shorten(accountId),
    signer: {
      accountId,
      async signTransaction(xdr, opts) {
        const passphrase = opts?.networkPassphrase ?? networkPassphrase;
        const res = await signTransaction(xdr, {
          networkPassphrase: passphrase,
          address: accountId,
        });
        if (res && "error" in res && res.error) {
          throw new Error(`Freighter sign: ${res.error}`);
        }
        const signedTxXdr = typeof res === "string" ? res : res.signedTxXdr;
        if (process.env.NEXT_PUBLIC_KAIDO_FEE_SPONSOR_ENABLED !== "true") {
          return { signedTxXdr, signerAddress: accountId };
        }
        const response = await fetch("/api/fee-sponsor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ signedInnerTxXdr: signedTxXdr }),
        });
        const sponsored = (await response.json()) as { sponsoredTxXdr?: string; error?: string };
        if (!response.ok || !sponsored.sponsoredTxXdr) {
          throw new Error(`Fee sponsorship: ${sponsored.error ?? "unavailable"}`);
        }
        return {
          signedTxXdr: sponsored.sponsoredTxXdr,
          signerAddress: res.signerAddress ?? accountId,
        };
      },
    },
  };
}

async function freighterInstalled(): Promise<boolean> {
  try {
    const res = await isAllowed();
    if (res && "error" in res && res.error) return false;
    return true;
  } catch {
    return false;
  }
}

async function freighterConnected(): Promise<boolean> {
  try {
    const res = await isConnected();
    return Boolean(res && (typeof res === "boolean" ? res : res.isConnected));
  } catch {
    return false;
  }
}

async function readFreighterAddress(): Promise<string> {
  const addrRes = await getAddress();
  if (addrRes && "error" in addrRes && addrRes.error) {
    throw new Error(`Freighter: ${addrRes.error}`);
  }
  const accountId = (typeof addrRes === "string" ? addrRes : addrRes?.address) ?? "";
  if (!accountId) throw new Error("Freighter returned no address");
  return accountId;
}

export const freighterConnector: WalletConnector = {
  kind: "freighter",
  name: "Freighter",

  async isAvailable() {
    return freighterInstalled();
  },

  async connect({ networkPassphrase }): Promise<ConnectedWallet> {
    const access = await requestAccess();
    if (access && "error" in access && access.error) {
      throw new Error(`Freighter: ${access.error}`);
    }
    const accountId = await readFreighterAddress();
    return buildWallet(accountId, networkPassphrase);
  },

  async restoreSession({ networkPassphrase }) {
    if (!(await freighterConnected())) return null;
    try {
      const accountId = await readFreighterAddress();
      return buildWallet(accountId, networkPassphrase);
    } catch {
      return null;
    }
  },

  async disconnect() {
    // Freighter has no programmatic disconnect; the provider drops the session.
  },
};
