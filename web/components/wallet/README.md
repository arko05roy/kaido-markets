# Wallet

Connector indirection over Freighter — `WalletProvider` holds the active
session and `useWallet()` exposes a `KaidoSigner` plus connect/disconnect.
Additional wallets plug in by implementing `WalletConnector` in `./types.ts`
and registering them in `provider.tsx`.
