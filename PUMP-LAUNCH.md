# MemeSplice Phase 3 — final pre-mainnet verification

Verified September 27, 2026. **No transaction was broadcast. Both Pump launch flags remain false.**

## Result and remaining blockers

The real, locally installed Phantom wallet rehearsal now passes. The user performed the connection/reconnection and approval flow in their normal browser and reported:

> Wallet signature verified locally. No mint signature, no broadcast, no token created.

The connected wallet's default transaction passed simulation through the configured production Helius mainnet RPC before the approval button became available. The wallet signature was verified locally and discarded. We did not operate or inspect the normal browser directly; this installed-wallet result is user-confirmed. Solflare compatibility has automated official-adapter coverage, but a real installed Solflare approval was not performed.

**No remaining blocker was found for the first intentional default Phantom launch.** Launching remains deliberately disabled and requires a separate intentional enablement and user wallet approval. Simulation is not a guarantee of eventual inclusion or future fee/global-state availability. Neither launch flag was enabled during this work.

## Launch settings

The existing review dialog now has three simple switches, all off by default:

- **Initial buy:** no prefilled paid amount, no MAX button. If enabled, enter 0.001–10 SOL. Decimal parsing uses integer lamports, allows at most nine fractional digits, and rejects exponent notation, nonnumeric, zero, negative and out-of-range inputs. These bounds are MemeSplice product limits, not claimed Pump protocol limits.
- **Holder Rewards:** redirects creator trading rewards to holders. Its warning explicitly says the choice cannot be reversed, and the user must separately acknowledge it. A live Pump global gate controls availability.
- **Mayhem Mode:** optional automated, randomized trading during the token's first 24 hours, subject to Pump's termination conditions. The tooltip and link follow [Pump's official explanation](https://pump.fun/docs/mayhem-mode-disclaimer). A disabled or unreadable live global configuration disables the control; transaction simulation checks compatibility again.

Cashback is not exposed and is always false. SOL is the only quote asset. There is no custom-pair or creator-fee selector; Pump's standard fee schedule applies. See [official coin-creation parameters](https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/docs/instructions/COIN_CREATION.md) and [Holder Rewards behavior](https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/docs/HOLDER_REWARDS_README.md).

Before wallet approval the dialog shows offspring artwork, name/ticker, connected creator/payer, Solana Mainnet, Pump.fun, SOL pair, selected initial buy, rewards, Mayhem, verified IPFS metadata, estimated wallet spend, account/network costs, maximum buy spend and the irreversible-launch notice.

## Exact transaction construction

- Official package: `@pump-fun/pump-sdk` **2.0.0**.
- Wallet framework: `@solana/wallet-adapter-react` **0.15.40**, Phantom adapter **0.9.30**, Solflare adapter **0.6.34**, Wallet Standard discovery; `@solana/web3.js` **1.99.0**.
- Create-only: **`PUMP_SDK.createV2Instruction`**.
- Create plus initial buy: **`PUMP_SDK.createV2AndBuyV2Instructions`**. Returns create_v2, idempotent Token-2022 user ATA creation and buy_v2, included together in one atomic transaction. No separate hidden buy transaction.
- Fresh transient Token-2022 mint, six decimals. The connected user is the instruction's `creator`, `user` and transaction payer. With Holder Rewards enabled, Pump itself routes the on-chain curve's fee-recipient creator field to `holderRewardsPda(mint)`; verification accounts for that distinction.
- `name`, `symbol` and `uri` use the validated frozen offspring identity and existing pinned IPFS metadata.
- `mayhemMode` and `holderReward` follow the reviewed switches; `cashback=false`. `quoteMint` omitted for SOL pairing; creatorFeeBps omitted for standard fees.
- Initial token quantity is quoted with official `getBuyTokenAmountFromSolAmount`, using live Pump global reserves and fee configuration. The installed create+buy helper applies **1% slippage**. The server decodes buy_v2 and checks its exact maximum against `amount + floor(amount / 100)` lamports. A 0.10 SOL buy therefore permits at most 0.101 SOL for the buy, plus displayed account/network costs.
- Compute limit: 300,000 for standard create-only; 500,000 for an initial buy or Mayhem. Explicit compute-unit price: **0 micro-lamports**. This locks the fee instruction into the reviewed message; network base fees still apply. No undocumented priority fee is silently added by Splice.
- Larger atomic create+buy transactions use v0 plus an existing mainnet address lookup table. Current public table: `Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP`, configured server-side as `PUMP_ADDRESS_LOOKUP_TABLE`. It was observed in live Pump transactions, is not presented as an official Pump-owned table, and is controlled by a third party. Its program ownership and active status are checked on use. Existing address indexes cannot be rewritten; deactivation or removal can make future initial buys unavailable, in which case preparation fails closed. No lookup table was created on-chain. An operator-owned table can replace this dependency later.

The first Phantom rehearsal hit a strict message/signature mismatch. After adding the explicit fee-price instruction, the user repeated the rehearsal successfully. This is consistent with [Phantom's documented automatic fee enhancement](https://docs.phantom.com/developer-powertools/solana-priority-fees); transaction-message and signature checks remain strict.

## Mainnet simulation results

All requested A–E combinations, plus the three other combinations exposed by the switches, passed through the actual local API using the production Helius RPC, real hosted KnitBonk record and existing pins. These matrix results use a public funded protocol account as a simulation fixture, not the user's wallet. Every simulation used signature verification disabled and no broadcast RPC method. The separate real Phantom test covered the user's default configuration.

| Case | Initial buy | Holder Rewards | Mayhem | Mainnet simulation | Compute units | Estimated total SOL |
| --- | ---: | --- | --- | --- | ---: | ---: |
| A | Off | Off | Off | Pass | 97,542 | 0.005476080 |
| B | 0.10 SOL | Off | Off | Pass | 209,172 | 0.108986360 |
| C | Off | On | Off | Pass | 97,596 | 0.005476080 |
| D | Off | Off | On | Pass | 163,673 | 0.008178640 |
| E | 0.10 SOL | On | Off | Pass | 212,292 | 0.108986360 |
| F | 0.10 SOL | Off | On | Pass | 256,610 | 0.111688920 |
| G | Off | On | On | Pass | 151,727 | 0.008178640 |
| H | 0.10 SOL | On | On | Pass | 259,743 | 0.111688920 |

These are estimates, not fixed prices. Account setup costs depend on existing wallet accounts, metadata length and mode. Compute counts also vary with account derivation and selected protocol fee accounts. Default A measured 0.005466080 SOL account costs plus 0.000010000 SOL network fee. The minimum balance check additionally reserves **0.001 SOL** and the full buy slippage allowance. It does not spend that reserve automatically. Cost calculation uses atomic simulation pre/post balances, not unrelated balance reads at different slots; absent reliable simulation balances fail closed.

Latest raw evidence: `mainnet-simulation.json` and `wallet-check-api.json` alongside this report. All eight API calls reused existing CIDs and left hosted launch records unchanged. Forbidden prepare/submit/verify actions and cross-origin requests were rejected by the local wallet-check endpoint.

## Persistence and duplicate protection

Migration **202609270005_launch_settings.sql** was applied by the user and its new columns were verified against hosted Supabase. It extends the existing `offspring_launches` table; it creates no alternative schema and changes no generation settings.

Persisted fields:

- `initial_buy_lamports`, `holder_reward`, `holder_reward_acknowledged`, `mayhem_mode`
- `quote_asset='SOL'`, `cashback=false`, `slippage_bps=100`
- `estimated_wallet_cost_lamports`, `max_wallet_cost_lamports`, `account_cost_lamports`, `compute_units`
- Existing `network_fee_lamports`, wallet/mint, IPFS URIs, exact serialized message, unsigned transaction, last-valid block height and transaction signature.

`splice_guard_launch_settings` / `guard_launch_settings` freezes settings, costs, identity-critical transaction fields and mint once a transaction reaches AWAITING_SIGNATURE, which is stronger than waiting for SUBMITTED. Submitted signatures cannot be replaced. SQL constraints enforce bounds, SOL-only, cashback=false and Holder Rewards acknowledgment.

One active attempt per offspring, row locking, unique mint/signature and exact-message signature verification remain intact. Refresh or uncertain outcomes reconcile the same attempt; they do not regenerate launch settings or mints. The signature is persisted before any future authorized broadcast. A timeout never permits a blind second launch.

Before signing, a user can edit settings. If a real attempt has already exposed a transaction, its replacement waits for finalized blockhash expiry plus absence of both its mint and transaction; the UI explains the wait. Read-only rehearsals create no launch attempt and can be edited immediately. Definitively failed or expired attempts retain their historical settings and get a new attempt only when safe.

## Private material and no-broadcast rehearsal

Wallet private keys and recovery phrases never enter Splice. Only wallet public keys and signatures are requested through the adapter.

Mint material uses a browser-owned mutable transient signer buffer. The public address alone goes to the server. No private key is written to browser storage, files, cookies, logs or Supabase. On an eventual enabled launch, the wallet approves first, then the browser applies the mint signature and wipes the owned secret buffer. Message and wallet identity are checked before applying the mint signature. JavaScript cannot promise forensic memory erasure of every temporary runtime allocation; the application does not persist or transmit the secret.

In the rehearsal, the mint secret buffer is wiped and discarded **without ever signing**. The wallet signature alone is verified locally and discarded, with no signed transaction POST. The transaction therefore lacks a required mint signature and cannot be a valid token launch. `/api/wallet-check` supports only review and preflight, rejects submit/prepare actions, is restricted to localhost, is scoped to a server-configured completed offspring UUID, and only operates when both launch flags are explicitly false. It transfers no ownership/session cookie. It automatically becomes unavailable if launches are enabled. Unset `PUMP_WALLET_CHECK_OFFSPRING_ID` when the local rehearsal is no longer needed.

Compiled browser assets were scanned against configured server secrets and the private RPC URL: **no matches**. Both launch flags were rechecked and remain false. No AI provider, generation quota, queue or other frontend section was changed.

## Validation and operational notes

- **28 launch tests passed**: official SDK parameters and cap, validation, signature handling, v0 transactions, transient signer wiping, balance reserve, disabled launch gates, immutable SQL settings, ownership/leases/duplicate handling, UI defaults/acknowledgment/retries, official Phantom/Solflare adapter provider doubles and non-broadcast rehearsal.
- Production build and TypeScript passed. Targeted ESLint checks for modified launch application code passed.
- Repository-wide ESLint is not clean: it reports React hook findings outside launch code and CommonJS require-import rules across scripts/tests (123 errors, 5 warnings on that run, including CommonJS testing-style violations). No unrelated files were rewritten to suppress those checks.
- Existing optional bigint native-binding fallback and transitive punycode deprecation warnings remain. They did not prevent build, tests, simulation or real Phantom signing.
- Supabase schema/read checks succeeded, no new Supabase error reported. No further dashboard migration action is needed for this change.
- Keep `PUMP_LAUNCH_ENABLED=false` and `PUMP_MAINNET_LAUNCH_ENABLED=false` until a separately requested intentional launch. This work stops before broadcast.

## Launch delivery update — September 28, 2026

Production preparation now requests a priority-fee estimate for the exact unsigned transaction through the configured Helius RPC. Non-Helius endpoints use recent writable-account fee samples. Estimates are rounded up, bounded by a 0.001 SOL total priority-fee cap, and included in simulation, wallet-balance checks, and the review before signing. An unavailable estimate or a quote above the cap blocks preparation. The blockhash is refreshed after quoting and before final simulation/persistence; it is never changed after the message is exposed.

RPC forwarding allows up to 40 retries of identical signed bytes (subject to blockhash expiry). This does not create another mint, transaction signature, or independently approved spend. Positive RPC receipt and sanitized send-error categories are retained in the existing error_message_safe column; neither means chain confirmation. Duplicate protection and finalized verification remain authoritative. No schema migration is needed.

PlexoRug's expired attempt used two verified first-generation parents and passes simulation with its selected 0.001 SOL initial buy and Holder Rewards. It is eligible for generation 2 only after a future mainnet launch is verified. The expired attempt produced no mint. Testing this update did not broadcast a transaction.
