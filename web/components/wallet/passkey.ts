/**
 * Passkey connector — `passkey-kit` smart wallet. The WebAuthn credential lives
 * in the platform authenticator; no signing key ever reaches the browser.
 *
 * Config (never hardcoded — build.md §0a): the wallet-contract WASM hash and the
 * RPC come from `NEXT_PUBLIC_PASSKEY_WALLET_WASM_HASH` / the active network's
 * RPC. Transaction *submission* uses Launchtube, which holds a secret JWT, so it
 * is proxied through the server route `/api/launchtube` rather than called from
 * the browser. The end-to-end "play in ~10s" funding/sponsorship flow is
 * finished in Sprint 4 (build.md E13); this connector creates/connects the
 * wallet and produces a `KaidoSigner` now.
 */
import { PasskeyKit } from "passkey-kit";

import type { ConnectedWallet, WalletConnector } from "./types";

const KEY_ID_STORAGE = "kaido.passkey.keyId";

let kit: PasskeyKit | null = null;

function getKit(rpcUrl: string, networkPassphrase: string): PasskeyKit {
  const walletWasmHash = process.env.NEXT_PUBLIC_PASSKEY_WALLET_WASM_HASH;
  if (!walletWasmHash) {
    throw new Error(
      "Passkey wallet not configured: set NEXT_PUBLIC_PASSKEY_WALLET_WASM_HASH " +
        "(the deployed smart-wallet WASM hash). Use Freighter in the meantime.",
    );
  }
  if (!kit) {
    kit = new PasskeyKit({ rpcUrl, networkPassphrase, walletWasmHash });
  }
  return kit;
}

/** Submit a signed transaction XDR via the server-side Launchtube proxy. */
async function submitViaLaunchtube(xdr: string): Promise<string> {
  const res = await fetch("/api/launchtube", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ xdr }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Launchtube submission failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { hash?: string };
  if (!data.hash) throw new Error("Launchtube returned no transaction hash");
  return data.hash;
}

export const passkeyConnector: WalletConnector = {
  kind: "passkey",
  name: "Passkey (no seed phrase)",

  async isAvailable() {
    return (
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined" &&
      Boolean(process.env.NEXT_PUBLIC_PASSKEY_WALLET_WASM_HASH)
    );
  },

  async connect({ networkPassphrase, network }): Promise<ConnectedWallet> {
    const rpcUrl =
      process.env.NEXT_PUBLIC_RPC_URL ??
      (network === "mainnet" ? "" : "https://soroban-testnet.stellar.org");
    if (!rpcUrl) {
      throw new Error("No RPC URL for the passkey connector — set NEXT_PUBLIC_RPC_URL");
    }
    const k = getKit(rpcUrl, networkPassphrase);

    const existingKeyId =
      typeof window !== "undefined" ? window.localStorage.getItem(KEY_ID_STORAGE) : null;

    let contractId: string;
    if (existingKeyId) {
      const { contractId: cid } = await k.connectWallet({ keyId: existingKeyId });
      contractId = cid;
    } else {
      const { keyIdBase64, contractId: cid, signedTx } = await k.createWallet(
        "Kaido",
        `kaido-${Date.now()}`,
      );
      // Deploy the smart wallet via Launchtube (server holds the JWT).
      await submitViaLaunchtube(signedTx.toXDR());
      window.localStorage.setItem(KEY_ID_STORAGE, keyIdBase64);
      contractId = cid;
    }

    return {
      kind: "passkey",
      accountId: contractId,
      label: "Passkey wallet",
      signer: {
        accountId: contractId,
        async signTransaction(xdr) {
          // Attach the WebAuthn auth entry, then hand the assembled XDR back.
          // The caller submits it (the ChartGuessr loop routes passkey txs
          // through `/api/launchtube` rather than the RPC `sendTransaction`).
          const keyId = window.localStorage.getItem(KEY_ID_STORAGE);
          if (!keyId) throw new Error("Passkey session lost — reconnect");
          const assembled = await k.sign(xdr, { keyId });
          return { signedTxXdr: assembled.toXDR(), signerAddress: contractId };
        },
      },
    };
  },

  async disconnect() {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY_ID_STORAGE);
    kit = null;
  },
};
