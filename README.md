# Kaido

Kaido is a numerical prediction-market primitive on Stellar: participants state a predicted value and confidence range rather than choosing YES or NO.

## Production links

- App: https://kaido-cyan.vercel.app/
- Stellar Mainnet contract: [`CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6`](https://stellar.expert/explorer/public/contract/CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6)
- Mainnet deployment transaction: [`d3650b7c…67493f4`](https://stellar.expert/explorer/public/tx/d3650b7c1d7d3a10a54c6e859ff4e318d1091b74ea5eb2fcee7438bed67493f4)
- Launch post: https://x.com/kaidomarkets/status/2068592591051071557?s=20
- X profile: https://x.com/kaidomarkets
- Demo: [voiceover](https://youtu.be/OgPWWf3nyto) · [no voice](https://youtu.be/ILiez9hhDGY)

## Level 6 evidence status

The source repository contains evidence of one deployed Soroban contract and an internal audit/remediation record. It does **not** contain verifiable proof of 20 mainnet users, a public Google Form, an export of its responses, or an ecosystem contribution. Those requirements must be completed with real public records before resubmission; testnet activity and signup counts do not satisfy them.

| Requirement | Evidence currently linked | Status |
| --- | --- | --- |
| Public dApp | [Kaido app](https://kaido-cyan.vercel.app/) | Linked; mainnet transaction flow must be checked before review |
| Mainnet contract | [Contract](https://stellar.expert/explorer/public/contract/CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6) and [deployment transaction](https://stellar.expert/explorer/public/tx/d3650b7c1d7d3a10a54c6e859ff4e318d1091b74ea5eb2fcee7438bed67493f4) | Linked |
| 20+ verified mainnet users and activity | None | Not evidenced |
| Public feedback form and public Excel export | Existing [response sheet](https://docs.google.com/spreadsheets/d/1YQnSM6HBn1tFuu6D_6AYoWhP4ogM74c3DbehD4FayIg/edit?usp=sharing); no form link | Incomplete |
| Smart-contract audit/remediation | [Audit findings and remediation plan](docs/contract-audit-fixes.md) · [remediation commit](https://github.com/arko05roy/kaido-markets/commit/0f1dff1) | Internal audit evidence linked |
| Launch promotion | [Launch post](https://x.com/kaidomarkets/status/2068592591051071557?s=20) and demo links | Linked |
| Ecosystem contribution | None | Not evidenced |
| Advanced feature | Fee sponsorship ([service](web/app/api/fee-sponsor/route.ts), [validation](web/lib/stellar/fee-sponsorship.ts)) | Implemented; configure and demonstrate on mainnet |

## Required feedback form

Create and publish a Google Form with these required fields, then replace the `FORM_URL` placeholder below and export the responses to the linked public sheet.

- Name
- Email
- Stellar mainnet wallet address
- Product rating (1–5)
- Which feature did you like most?
- What feature is missing?
- Did you encounter bugs or usability issues?
- Would you recommend Kaido to others? Why?
- What should we improve next?

- Google Form: `FORM_URL`
- Public Excel/Google Sheets response export: [existing sheet](https://docs.google.com/spreadsheets/d/1YQnSM6HBn1tFuu6D_6AYoWhP4ogM74c3DbehD4FayIg/edit?usp=sharing)

## Users onboarded

Only add a row after confirming that the person consented to publication, submitted the form, and completed a Kaido-related **mainnet** transaction. Do not list testnet wallets or unverified signups here.

| User ID | Name | Email | Wallet address | Feedback summary | Mainnet transaction |
| --- | --- | --- | --- | --- | --- |
| No verified records committed | — | — | — | — | — |

## Feedback implementation

Record an item only when a verified user’s feedback led to a shipped change. Use the full GitHub commit URL, not an unverified or unrelated commit.

| User ID | Name | Email | Wallet address | Feedback summary | Improvement made | Git commit ID |
| --- | --- | --- | --- | --- | --- |
| No verified records committed | — | — | — | — | — | — |

## Early product-feedback summary

This is aggregate early-interest feedback recovered from the prior Level 6 README. It is not presented as verified mainnet-user evidence and does not replace the two tables above.

Kaido collected 64 early-interest responses. Recurring requests were:

- A guided first-trade flow explaining the belief curve with a live example.
- Forecast history showing a user’s original prediction, final outcome, and payout.
- A clearer liquidity dashboard for locked collateral, free collateral, fees, and withdrawal conditions.
- Explicit settlement information: data source, resolution timing, and claim steps.
- More crypto, sports, live-event, analytics, and reward/referral market experiences.

### Improvements shipped

| Feedback theme | Improvement |
| --- | --- |
| Belief curves are unfamiliar to new users | Improved onboarding and first-trade clarity |
| Users need clearer wallet and position visibility | Added position tracking and smoother wallet UX |
| Users want stronger safety signals | Continued contract hardening and regression coverage |
| Users want lower onboarding friction | Added fee sponsorship for eligible trade, liquidity, and claim actions |

## Improvement summary

The prior README described early-interest signup feedback as if it were mainnet-user evidence. That claim has been removed. The contract workspace now retains only the source for the deployed `distribution-market` contract, and deployment tooling builds/deploys only that contract. Commit link: add this change’s commit URL after committing.

## Smart-contract audit and remediation

Kaido’s internal smart-contract audit findings and remediation plan is published in [Contract Audit Fix Plan](docs/contract-audit-fixes.md). The corresponding remediation is tracked in [commit `0f1dff1`](https://github.com/arko05roy/kaido-markets/commit/0f1dff1), with regression coverage in the current contract test suite. This is internal audit evidence; the repository does not attribute it to an external auditor.

## Advanced feature: fee sponsorship

Kaido supports gasless user actions through Stellar fee-bump transactions. Freighter signs the user's original transaction first; `/api/fee-sponsor` only accepts one short-lived, signed invocation of the configured Kaido contract for trading, liquidity, or claims. It signs the outer fee-bump envelope with the sponsor account. The sponsor never receives a user secret and cannot modify the user-signed operation.

Enable this only after funding a dedicated sponsor account and configuring:

```sh
KAIDO_FEE_SPONSOR_SECRET=S...             # dedicated sponsor; never NEXT_PUBLIC
KAIDO_FEE_SPONSOR_CONTRACT_ID=C...        # deployed DistributionMarket id
KAIDO_FEE_SPONSOR_MAX_FEE_STROOPS=2000000
KAIDO_FEE_SPONSOR_BASE_FEE_STROOPS=100000
NEXT_PUBLIC_KAIDO_FEE_SPONSOR_ENABLED=true
```

The service enforces a contract/method allow-list, a single operation, a five-minute expiry, a signed inner transaction, and a fee cap. Add a public mainnet fee-bump transaction link after the live demonstration.

## Contract scope

`contracts/contracts/distribution-market` is the sole deployed-contract source retained in this repository. The previously included factory, registry, resolver, and Blend adapter source packages were removed because no mainnet addresses were supplied for them. Generated client bindings may still exist as historical artifacts and are not deployment evidence.

## Development

```sh
pnpm install
pnpm --dir web test
(cd contracts && cargo make test)
(cd contracts && cargo make build-wasm)
```

For a mainnet deployment, configure `RPC_URL` and an imported `DEPLOYER_KEY_NAME`, review the WASM and initialization parameters, then run:

```sh
MAINNET_DEPLOY_CONFIRM=I_UNDERSTAND_MAINNET_DEPLOY \
  STELLAR_NETWORK=mainnet \
  ./contracts/scripts/deploy-mainnet.sh
```

Never use demo assets, testnet addresses, generated wallets, or fabricated user data in Level 6 evidence.

## Further documentation

- [Whitepaper](kaido-whitepaper.md)
- [Build plan](build.md)
- [Architecture decisions](docs/adr/)
- [Feedback UX notes](docs/user-feedback.md)
