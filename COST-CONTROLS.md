# Splice: cost controls and shared queue

Implemented September 27, 2026. The approved theme, navigation, sections, animation assets, Family Tree and Explore visuals are preserved. Only generation/search behavior and the related copy/layout changed.

## Current operational status

Supabase/OpenAI/Storage are connected. Apply migration 003 for public launch controls. See PUBLIC-AI-OPERATIONS.md for current deployment, worker, enablement and recovery instructions. Earlier implementation notes below describe the original rollout.

## 1. One offspring

Page state contains one `Offspring | null`, not a collection of three choices. Hero, feature, process, status and result copy now describe one child. Each result keeps its image, name, ticker, tagline, lore, traits, DNA percentages, generation and both mint references. The card and draft editor retain their styling. Mutate Again posts a new custom request; it never rotates the Instant pool or renders extra candidates.

The worker validates one complete result, refuses arrays or changed mint references, stamps its job ID and generation, and stores one draft. There are no automatic generation retries. Public lineage still contains illustrative records; a draft does not become a launch.

## 2. Instant / Recommended Splices

`lib/generation/instant-splices.ts` contains six pair definitions, each with three prepared variants (18 editorial records). Clicking a pairing picks exactly one prepared child, avoiding the immediately previous variant when possible. It loads immediately, clearly labeled **Instant Splice · Prepared**. Artwork reuses the existing approved atlas, not newly generated images. These are prepared demonstration offspring, not already launched tokens.

Pairs: BONK × WIF, POPCAT × FARTCOIN, BONK × POPCAT, WIF × FARTCOIN, BONK × FARTCOIN, WIF × POPCAT. The six existing pairing slots are preserved. Surprise Me also loads an Instant Splice. None of these actions calls DEX, Helius, an AI provider or the queue, and none consumes a custom allowance. Instant results remain usable while a custom job is active; the job continues independently with its stored parent snapshot.

Pools use a typed `InstantPair` model and are easy to expand or move behind a database repository later. Editing a loaded draft does not mutate its prepared pool record.

## 3. Persistent global queue

Apply `supabase/migrations/202609270001_cost_controls.sql` once to a new Supabase database. It creates `generation_jobs`, singleton `generation_settings`, token cache/lease tables, search attempts and parent analysis cache, plus transaction functions. Queue state is never an in-memory JavaScript array. Supabase is accessed only by the server over its REST/RPC API.

Admission uses a signed, HttpOnly session cookie and a hashed trusted client IP. Requests have a UUID idempotency key. A repeated request returns the same job; a session with an active job receives that job instead of a second one. Ordering uses an increasing database sequence, not client timestamps or mutable position fields.

Statuses: QUEUED → ANALYZING → SPLICING → GENERATING → FINALIZING → COMPLETE, or FAILED. Claims receive a unique lease token. Updates require that token, an unexpired lease and the next allowed stage. Expired worker leases fail without automatic requeue, preserving at-most-one automatic attempt. Failed starts still count against cost caps. Queued jobs expire after 24 hours. Stage updates renew five-minute leases; a future provider must stay within that contract.

## 4. Live queue position

The browser receives private Server-Sent Events (SSE), backed by Supabase state. This is the shared live-update mechanism for this revision, not a direct Supabase Realtime browser subscription. The server checks the owned job every two seconds and emits changes without page refresh. Other users' job details, session IDs and IP hashes are never sent.

Position is the count of QUEUED jobs with sequence less than or equal to this job's sequence. Started/completed/failed jobs leave that count. The estimate uses current active worker slots, configured concurrency and recent observed generation duration, with coarse rounding and a fallback. Connection interruptions reconnect automatically; a missing/expired session is handled separately. A session-storage job ID is only a resume pointer; the database remains authoritative.

## 5. Shared quotas and worker concurrency

The singleton settings row lock serializes all admission and claims. Both rolling hour/day counts remain authoritative across instances. There is no per-minute quota or start-spacing clock. A separate shared 25-worker cap protects infrastructure. The persistent dispatcher polls authenticated health, fills free slots, and never retries an uncertain job. See PUBLIC-AI-OPERATIONS.md.

## 6. User and hard safety caps

- One active custom job per signed session, enforced by a database partial unique index and admission transaction.
- Default three custom admissions per rolling hour per session **or** hashed IP. Failed admitted jobs still consume this allowance. Instant results do not.
- Default global maximum: 3,000 starts/rolling hour and 9,000 starts/rolling 24 hours. Values are counts, not dollar-cost predictions. Hour/day values of zero close custom admission/dispatch.
- Admission reserves space for queued jobs against hour/day capacity and limits the queue to 1,000 waiting jobs. Start-time checks repeat the caps immediately before work, including if an operator lowers a cap after enqueueing.
- Capacity produces a clean message offering an Instant Splice.

The environment values are applied explicitly with `npm run configure:generation`; they are copied to the one shared settings row. They are not independently interpreted by each server. The command deliberately leaves `enabled=false`. When changing limits later, rerun this command and only re-enable after the approved provider is ready.

## 7. Search costs

Name/ticker path: local catalog → normalized cache → DEX Screener only on a genuine miss. Local matches and cache hits do not consume discovery permits. DEX receives queries of at least three characters; the UI debounces text for 600 ms and shows at most five candidates. Direct mint detection bypasses that debounce and name discovery.

**Helius is never called per candidate.** Selecting a candidate calls `/api/tokens/verify`; the parent changes only after successful verification. Pasting an exact mint uses the same verification service. Both paths check the verified cache first. Successful Helius data caches for **24 hours** by case-sensitive mint; verification failures are not long-cached. There are no extra DEX requests for price/market refresh or direct-CA enrichment.

Name queries normalize case, surrounding/repeated whitespace and leading `$`. Discovery caches for **10 minutes**. Successful public search responses carry CDN headers with 600-second shared freshness and 300-second stale-while-revalidate. Client-generated URLs use normalized text. Verification responses allow 24-hour CDN freshness. Error responses use `no-store`. Providers' market data may therefore be old; this is not a trading feed.

With Supabase configured, server memory is a bounded first-level cache and Supabase is the shared second-level cache. Database fetch leases collapse simultaneous misses across instances; in-process promises also deduplicate requests. Leases are fenced by unique tokens so an old request cannot release a newer lease. Without Supabase, token search remains usable with bounded process-local caches and limits, but cache/counter sharing is not available.

External discovery attempts are limited to ten per rolling minute per hashed caller. Actual uncached verification has its own ten/minute bucket. Cached and local hits bypass these buckets. Provider HTTP 429 responses preserve Retry-After; server-side cooldowns (shared when configured) and client cooldowns prevent aggressive retry. DEX failures do not block catalog hits, cached discovery or direct Helius lookup. No paid Redis service was added.

## 8. Confirmed local catalog

| Token | Solana mint |
|---|---|
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |
| WIF | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| POPCAT | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` |
| FARTCOIN | `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` |

All four were cross-checked against DEX Screener's Solana token-pair API during this revision. Additional provenance: [Helius BONK example](https://demo.helius.dev/get-assets/fungible-token), [Solana Explorer WIF](https://explorer.solana.com/address/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm), [Poloniex POPCAT listing](https://support.poloniex.com/hc/en-us/articles/21785765820439-New-Listing-Popcat-POPCAT), [Solana Explorer Fartcoin](https://explorer.solana.com/address/9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump). Catalog entries reference the existing local artwork atlas and contain no invented market data. Suggested pairings reference these exact coin records directly.

## 9. Parent analysis and future low-cost pipeline

`parent_analysis_cache` is keyed by mint, with a metadata/image fingerprint, analysis version, traits and expiry. Server helpers read/write it with a default 30-day TTL. A changed fingerprint/version invalidates a reuse. No analysis model calls are implemented.

The future adapter contract specifies one offspring, one low-quality image, maximum 512px reference edge / 150 KB WebP, the lowest-cost suitable text tier, no partial image streaming, zero automatic retries and no launch-quality upgrade. These settings are a contract for the future adapter, not a claim that image compression or AI calls are already running. The future adapter must implement safe image fetching/compression and cache reuse before sending images to a provider.

## 10. Setup / accounts / environment

One Supabase project is needed. No account was created or charged during this revision. In its SQL Editor, apply the supplied migration once. Use a Supabase Secret API key (`sb_secret_...`) on the server only, sent in the `apikey` header. Never expose it in a `NEXT_PUBLIC_` variable or send it as a Bearer JWT.

Add to `.env.local` in the MemeSplice folder:

```dotenv
HELIUS_API_KEY=
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=
SESSION_SECRET=
GENERATION_WORKER_SECRET=
GENERATION_WORKER_URL=http://localhost:5173/api/generation/worker
TRUSTED_CLIENT_IP_HEADER=
MAX_AI_WORKER_CONCURRENCY=25
MAX_CUSTOM_GENERATIONS_PER_HOUR=3000
MAX_CUSTOM_GENERATIONS_PER_DAY=9000
MAX_CUSTOM_GENERATIONS_PER_USER_HOUR=3
```

Generate separate random values of at least 32 characters for the two secrets; do not reuse API keys. Set the IP header only to one your trusted hosting proxy overwrites. If blank, unidentified clients deliberately share one bucket, so the application cannot be bypassed by spoofing an arbitrary forwarding header; configure the correct ingress header before public traffic. Anonymous cookies/IPs are basic protection, not full account identity.

Run `npm run configure:generation` after the migration to save shared limits. Restart the app after environment changes. `npm run dev` or `Start-MemeSplice.cmd` opens the site on port 5173; production locally uses `npm run build` then `npm start`.

After a separately approved AI integration, enable the database setting and run `npm run worker` on a persistent Node process (or equivalent trusted scheduler). The current adapter cannot generate paid work even if the database is manually enabled. Use Supabase's built-in Cron to run `select public.splice_maintenance();` periodically (for example hourly) to expire cache/lease/rate-limit records and recover stale jobs. Do not delete recent start records: they enforce spend limits.

New package: **`@electric-sql/pglite` as a development-only dependency** for testing the actual PostgreSQL migration/functions locally. It is already installed here. Fresh copies need `npm ci`. No Supabase client SDK or paid Redis package is required at runtime.

## 11. Validation and limitations

`npm run test:tokens` and `npm run test:queue` cover token artwork/caching, no-cost Instant Splices, worker policy/lineage validation, queue order/position, idempotency, one active session, 25 concurrent workers, 3,000/hour, 9,000/day, user/IP caps, lease recovery, cache locks, denied anonymous access and concurrency-based dispatch policy.

Queue tests execute the real migration and functions with PGlite's PostgreSQL engine. Its single connection serializes execution; they are not a hosted multi-connection stress/load test. The SQL row lock is the cross-server coordination mechanism, but production multi-worker testing is still required after Supabase setup. Browser checks cover the currently available Instant/search behavior and the unconnected custom-provider boundary. No claim is made that paid custom jobs ran.

Remaining scaling considerations: SSE currently performs an owned-job database read every two seconds per connected queued user; a shared Supabase Realtime fan-out would reduce those reads at larger scale. The FIFO count also grows with queue size, bounded here at 1,000. Anonymous limits can be circumvented with different networks/cookies; add real identity or stronger abuse controls if needed. Shared token caching needs Supabase; CDN behavior depends on hosting configuration. Live authenticated Helius, hosted RLS/RPC, SSE under production proxies, operator limits setup, and multi-worker failover remain unverified without credentials. Long-running worker/SSE routes require compatible hosting timeouts. Old static `out/` hosting cannot run this backend. No deployment was performed.

## 12. File manifest

Added:
- `COST-CONTROLS.md`
- `supabase/migrations/202609270001_cost_controls.sql`
- `lib/server/supabase.ts`, `lib/server/identity.ts`
- `lib/tokens/catalog.ts`, `lib/tokens/server/shared-cache.ts`
- `lib/generation/instant-splices.ts`, `types.ts`, `provider.ts`, `worker.ts`, `server.ts`
- `hooks/use-token-selection.ts`, `hooks/use-generation-job.ts`
- `app/api/tokens/verify/route.ts`
- `app/api/generation/jobs/route.ts`, `app/api/generation/jobs/[id]/route.ts`, `app/api/generation/jobs/[id]/events/route.ts`, `app/api/generation/worker/route.ts`
- `scripts/configure-generation.mjs`, `scripts/generation-dispatcher.mjs`
- `tests/queue.test.mjs`

Changed:
- `app/page.tsx`, `app/layout.tsx`, `app/refinements.css`
- `components/memesplice/coin-picker.tsx`, `header-coin-search.tsx`, `offspring-card.tsx`
- `lib/memesplice/types.ts`, `mock-data.ts`, `services.ts`
- `lib/tokens/client.ts`, `errors.ts`, `providers/helius-token-provider.ts`, `providers/dexscreener-token-provider.ts`, `server/http.ts`, `server/index.ts`, `server/token-search-service.ts`
- `app/api/tokens/search/route.ts`, `hooks/use-token-search.ts`
- `.env.example`, `package.json`, `package-lock.json`
- `scripts/test-tokens.mjs`, `tests/tokens.test.cjs`
- `README.md`, `TESTING.md`

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Cron](https://supabase.com/docs/guides/cron), [DEX Screener API](https://docs.dexscreener.com/api/reference).

## Current token-search reliability and cost policy (2026-09-27)

This update supersedes earlier token-search implementation notes above. Discovery uses local catalog, process cache, best-effort shared cache, then DEX. Helius enriches only missing/invalid or known-failed native artwork; selection and direct-mint verification use the verified cache first. DEX transient transport failures and HTTP 502/503/504 get one retry inside the same permitted/coalesced request, with no retry for 429 or other 4xx. Shared cache failures do not discard provider results. Healthy shared permits and leases remain authoritative; during infrastructure outages, process coalescing and a maintained local ten/minute caller ceiling bound fallback, without guaranteeing cross-worker coordination while Supabase is unavailable. See TOKEN-SEARCH-FIX.md for evidence and limitations. Generation limits and AI-disabled settings are unchanged.
