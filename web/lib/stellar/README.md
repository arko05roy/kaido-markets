# stellar

RPC client, network config, USDC SAC handle, tx builders (wraps
`@stellar/stellar-sdk`). `networks.ts` is the static network table — kept in
sync with `config/networks.json` and `contracts/network.toml`. No per-network
contract ids here (resolved at deploy time).
