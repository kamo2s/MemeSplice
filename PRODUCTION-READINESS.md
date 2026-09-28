# Production readiness — 2026-09-28

The local application is functional, but public deployment is not yet approved.
This audit made no paid AI calls, uploads, or blockchain submissions.

## Implemented during the audit

- Added `npm run worker:launches`: a serial, supervised reconciliation loop calling authenticated `POST /api/launch/reconcile`. It only verifies existing attempts, including wallet-broadcast recovery, and safely expires attempts using the existing finalized-height/signature/mint checks. It cannot prepare, sign, pin or submit. It keeps running when new launches are disabled. Three records per page; keyset cursor wraps; individual errors do not starve later records.
- Added framing protection, nosniff, restricted base/object sources and referrer policy. This is baseline hardening, not a complete script CSP.
- Added `npm run check:readiness`: read-only settings, queue, RPC and built-browser secret scan. It prints presence/health only, never secret values. It does not constitute hosted RLS or backup verification.
- Updated compatible Babel/Browserslist dependencies; constrained ws 8.x to 8.22.0 while preserving ws 7.x consumers. Pump SDK and wallet adapter versions are unchanged.

## Confirmed controls

Signed HttpOnly sessions scope generation status and launch ownership. Mutation endpoints check same-origin requests. Database admission/claim locks serialize shared quotas and concurrency; unique active-job/launch indexes prevent duplicates. Expired AI leases fail without automatically replaying paid calls. Provider calls reserve a persistent ledger entry before execution; provider auth failures pause generation. Signed launch bytes must match the saved message and all signatures must validate. The signature is saved before broadcasting. Retry checks never blindly create another mint. Only finalized transaction/mint/curve/creator verification establishes public lineage. Mint secret exists transiently in browser memory and is wiped; wallet private keys remain in the wallet.

The generation kill switch stops new admissions and claims, not already-started calls. Both Pump switches gate prepare/submit, while reconciliation remains available. Settings are immutable once a signable transaction is exposed. IPFS assets reuse their saved identity/CIDs.

## Deployment blockers and required decisions

1. Select a production hostname and persistent Node host. Use three supervised processes: web, AI dispatcher, launch reconciler. The old static hosting metadata is not applicable. Do not expose the Node port directly. Current local mainnet switches remain enabled as previously authorized; do not copy that enablement blindly to a fresh public environment.
2. Set a trusted client IP header only after the reverse proxy overwrites it. It is currently blank, so all visitors share the unidentified IP quota. Set `Host`, `X-Forwarded-Proto`, and the trusted IP header; configure TLS, streaming without buffering, request limits and a 32 KB API body cap. Allow at least 480-second worker requests and 500-second shutdown grace. Validate same-origin requests and Secure cookies through the actual HTTPS ingress.
3. Resolve remaining dependency advisories before broad public launch. Do not run `npm audit fix --force`: it proposes downgrading the tested Pump/SPL stack. Remaining affected components include bigint-buffer, toml, stream-json and older uuid through SDK dependencies. Reachability varies: TOML is used by Anchor workspace tooling; application code does not parse visitor TOML, JSON streaming filters or uuid v3/v5/v6 buffers. bigint native bindings fail to load locally (JS fallback), but a Linux install could load them. This reduces some current exposure, not the advisories or the need for target-host verification.
4. Verify actual hosted database privileges and storage policies with the supplied read-only SQL. Migrations and local PostgreSQL tests enforce private tables/RPCs; the Secret API key cannot inspect PostgreSQL catalogs through ordinary REST. Do not report hosted RLS as verified merely because service-role requests work. Check backup availability and perform a restore drill in a separate project.
5. Configure service restart, external uptime/heartbeat alerts, stuck-launch and provider-error alerts, plus spend notifications. Count caps are not a dollar budget. Hosted current settings are enabled=true, 3000/hour, 9000/day, 3/session-or-IP/hour, concurrency=25; minute spacing was intentionally removed by migration 003. Revisit those limits for beta based on measured cost, not automatic changes by this audit.
6. Omit `PUMP_WALLET_CHECK_OFFSPRING_ID` and keep `AI_SMOKE_TESTS_ENABLED=false` in production. Set `TOKEN_WEBSITE_URL` after the domain is chosen, before new pins are created. Browser-session ownership is not cross-device account recovery; cookie loss loses access to drafts. Document this for beta users or implement authenticated recovery separately.

## Third supervised service

Use the same service account and protected environment file as the web/AI services described in PUBLIC-AI-OPERATIONS.md. Add:

```ini
[Unit]
Description=MemeSplice launch reconciliation
After=network-online.target memesplice-web.service
Wants=network-online.target
[Service]
Type=simple
User=memesplice
WorkingDirectory=/srv/memesplice
EnvironmentFile=/etc/memesplice.env
ExecStart=/usr/bin/node scripts/launch-reconciler.mjs
Restart=always
RestartSec=5
TimeoutStopSec=500
[Install]
WantedBy=multi-user.target
```

Set `LAUNCH_RECONCILER_URL=http://127.0.0.1:5173/api/launch/reconcile` for colocated services. Authentication reuses `GENERATION_WORKER_SECRET`. Never log that header. No migration is required for this worker. Pending attempts on a different cluster are intentionally excluded: do not change networks with pending transactions.

## Verification and remaining limits

Audit results: all 120 automated tests passed again after dependency updates. Production build (including TypeScript) passed. Targeted lint for the new runtime files passed. Full-repository lint is still failing: 149 errors and 5 warnings, largely CommonJS test-import rules and existing showcase ref analysis; this is a separate CI cleanup item, not a clean lint result. Current npm production audit has 24 affected dependency entries (8 high, 16 moderate; no critical), traced to four root packages named above. Entries include dependent packages and are not 24 distinct vulnerabilities.

Hosted read-only results: current worker heartbeat, zero active generation jobs, zero expired active leases, five VERIFIED and three historical FAILED launch attempts, five lineage rows; public feed has five offspring and eleven graph nodes. Mainnet genesis hash matches. Updated reconciliation route returns 401 without worker authentication and 200 with it; idle batch checked zero pending attempts. Baseline response headers verified on the running app. Built static chunks were scanned for exact configured secret values with zero matches. No new generation, IPFS upload, wallet approval or blockchain broadcast occurred. Local web and reconciliation processes were restarted/started; a managed production service and external alerting have not been provisioned.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run check:readiness` and `npm audit --omit=dev` on the target host. The audit tests use mocks and local PGlite; hosted verification is read-only. No current real Phantom signature or new mainnet launch was requested during this audit. Public lineage currently loads the whole graph per request; benchmark and cache/paginate it before large traffic. Set alert thresholds for retained failed calls and pending launches. Do not delete failed ledgers to recover quota.

Advisory references: [bigint-buffer](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), [ws](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [toml](https://github.com/advisories/GHSA-82x6-q7mm-w9cf), [stream-json](https://github.com/advisories/GHSA-528h-pc64-c93x), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
