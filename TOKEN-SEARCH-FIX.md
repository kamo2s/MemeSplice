# Token-search first-request fix

## Root cause and evidence

The server's Supabase response parser assumed every successful status other than 204 had a JSON body. PostgREST cache inserts requested `Prefer: resolution=merge-duplicates,return=minimal`. A new insert returns **HTTP 201 with an empty body**. Parsing it with `response.json()` threw a SyntaxError. The generic backend error became the public token-search HTTP 502.

The insert had already succeeded, so the next request could read its saved results. This explains the first-failure/Retry-success pattern. A scoped probe against the real hosted project confirmed status 201, body length zero, and the old parser's SyntaxError. Its temporary cache record was removed with HTTP 204. The earlier external-search 502 is consistent with this defect; that earlier request did not preserve an upstream trace, so its individual cause cannot be retrospectively proven.

The defect was in the application Supabase adapter, not a failed Supabase insert. No evidence identified DNS initialization, query normalization, frontend debounce, or a DEX outage as the cause of this reproduced failure.

## Changes

- Successful empty Supabase responses are accepted, including 201 and 204; nonempty responses are parsed normally.
- Local catalog and process cache remain first. Shared cache reads, upserts, leases, release and cooldown storage are best-effort, with one-second infrastructure deadlines. Their failures cannot discard successful provider results.
- Process-level in-flight coalescing remains in place. Healthy shared leases still coordinate workers; waiting allows another worker's transient retry to finish. If shared cache infrastructure becomes unavailable, discovery can fall back locally. Cross-worker deduplication cannot be guaranteed while that shared infrastructure is down.
- DEX requests retry once after 300–500 ms for HTTP 502/503/504, temporary timeout, connection reset and selected transient transport errors. No automatic retry for 400/401/403/404/429 or malformed JSON. Retry-After and provider cooldowns remain honored.
- The retry runs inside the original provider request and cache loader, so it uses one user search permit, one coalesced in-flight operation, and one cache upsert.
- Shared search denials remain authoritative. A maintained local ten/minute ceiling provides bounded fallback if the shared permit service itself is unavailable; this fallback is per process, not a replacement for the healthy shared limiter.
- Discovery candidates with valid native DEX artwork skip Helius. Missing/invalid artwork or artwork known to have failed in the image proxy can use cached Helius enrichment. Artwork is not proactively downloaded solely to test it. Selection/direct-mint verification still calls Helius on a verified-cache miss.
- Client loading lasts through the server retry. The existing 600 ms debounce and cancellation remain; obsolete/cancelled requests cannot publish success or error over a newer query. The outer client deadline is 65 seconds to allow shared-lease waiting, a bounded provider retry and optional artwork resolution. The manual Retry control is retained.
- Diagnostics log safe operation/provider names, HTTP status and selected error codes, never raw provider URLs, bodies, or credentials.

## Validation

Production server restarted with process cache empty. The disposable shared discovery entries for ramp and pnut were removed before the test:

| Search | First-request result | Time | Shared cache |
|---|---|---:|---|
| ramp | HTTP 200, 5 tokens | 2.227 seconds | populated |
| pnut | HTTP 200, 5 tokens | 1.750 seconds | populated |

Browser: ramp results displayed successfully. Rapid elon → pnut → BONK input ended with only BONK results. Loading state remained visible while waiting. Delayed cancelled success and delayed cancelled error races are also covered by automated tests using the same request-settlement helper as the hook.

35 token/artwork/worker/resilience tests and 10 queue/dispatcher/SQL tests passed (45 total). Coverage includes one DEX 502 then success; two 502s; 503/504/reset/timeout recovery; nonretryable statuses; DEX 429; cache read/write/lease/release outages; cache outage during lease waiting; shared permit denial and local fallback ceiling; cooldown persistence failure; normalization and coalescing; local-token zero-provider requests; selective Helius enrichment; selection verification; and successful empty PostgREST responses. Production build and TypeScript checks passed.

Generation settings were read back from the real project: historically disabled at the earlier launch settings (superseded by migration 003: no minute quota, 3000/hour, 9000/day, 3/user/hour, 25 workers). No AI provider was connected. No frontend design changes or new database migration are required. Updated production server is running at localhost:5173.
