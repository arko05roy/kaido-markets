/** Freighter connector — `@stellar/freighter-api`. Power-user fallback. */
import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

import type { ConnectedWallet, WalletConnector } from "./types";

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export const freighterConnector: WalletConnector = {
  kind: "freighter",
  name: "Freighter",

  async isAvailable() {
    try {
      const res = await isConnected();
      return Boolean(res && (typeof res === "boolean" ? res : res.isConnected));
    } catch {
      return false;
    }
  },

  async connect({ networkPassphrase }): Promise<ConnectedWallet> {
    const access = await requestAccess();
    if (access && "error" in access && access.error) {
      throw new Error(`Freighter: ${access.error}`);
    }
    const addrRes = await getAddress();
    if (addrRes && "error" in addrRes && addrRes.error) {
      throw new Error(`Freighter: ${addrRes.error}`);
    }
    const accountId =
      (typeof addrRes === "string" ? addrRes : addrRes?.address) ?? "";
    if (!accountId) throw new Error("Freighter returned no address");
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
          if (typeof res === "string") return { signedTxXdr: res, signerAddress: accountId };
          return {
            signedTxXdr: res.signedTxXdr,
            signerAddress: res.signerAddress ?? accountId,
          };
        },
      },
    };
  },

  async disconnect() {
    // Freighter has no programmatic disconnect; the provider drops the session.
  },
};
