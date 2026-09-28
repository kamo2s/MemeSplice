# Verification

Completed 26 September 2026.

## Additional PDF revisions

- Production build and TypeScript validation passed after applying `instruction.pdf`.
- Header and footer links follow Home, How It Works, Create, Family Tree, Explore. Visible site copy and browser metadata use Splice.
- The hero contains one Generate Offspring button. Surprise Me changes the parents without scrolling from the hero.
- Header suggestions appear while typing; keyboard navigation selects a result and clears the query. Name/ticker filtering and exact demo-CA selection work.
- The parent list is inside the dialog, containing all 12 coins. Desktop wheel down/up moved scrollTop from 0 to 436 and back; dragging the scrollbar also reached 436, with the last coin selectable. Mobile scrolling reached the last coin and exact-CA keyboard selection succeeded.
- After choosing a nonrecommended offspring, exactly one card retains the selected purple outline; unselected cards have the neutral border and no glow. The recommendation badge remains.
- Each portrait is 1:1 at 320, 375, 390, 430, 768, and 1440 pixels. Inherited traits remain visible without a disclosure control. The desktop comparison grid is 1080 pixels wide with 348-pixel cards.
- Responsive checks found no horizontal page overflow. The mobile parent dialog and its coin list fit inside the viewport.

## Earlier workflow verification

- Next.js production static export: passed.
- TypeScript compilation: passed.
- Exported page served over local HTTP: 200, with production Next.js assets.
- Browser checks: mock wallet dialog; keyboard dismissal; parent picker; name/ticker search; pasted exact demo CA; no-match feedback; suggested pair; loading state; three results; one recommendation; selected offspring; matching launch preview; family node details; all five Explore tabs; mobile navigation; clearing stale results; disabled generation with a missing parent.
- Responsive overflow checks passed at 320, 375, 390, 430, 768, and 1440 pixels.
- Data invariants: all 132 ordered combinations of different parents return three unique names and tickers, exactly one recommendation, and DNA percentages totaling 100.
- Random pairing: 1,000 samples contained two different parents.
- Address search: all 12 demo contract addresses returned the intended coin.
- Revision flow: popular-pair selection fills both parents, clears stale results, and scrolls to Create; generation scrolls to the separate comparison section and keeps Create active in the sticky navigation.
- Draft editing: invalid names and tickers are rejected, lowercase tickers normalize to uppercase, saved name/ticker/lore reach the selected result and launch preview, and Cancel discards edits.
- Draft isolation: generating, selecting, editing, and previewing a launch leave the five public lineage nodes, six Explore entries, descendant counts, and recent birth unchanged.
- Revised data checks: all 132 ordered pairs have three distinct names, tickers, lore, taglines, and artwork cells; order is balanced / Parent A / Parent B, with only the balanced child recommended. Gen 2 records include a Gen 1 parent.
- Mobile checks: parents appear before the chamber and Generate action; vertical steps/results, horizontal pair swiping, expandable lineage stages, node details, mobile menu navigation, and two-column Explore remain usable. No page overflow at 320, 375, 390, 430, 768, or 1440 pixels.
- All five Explore tabs work; Gen 2+ shows two records and Community Favorites shows three. Header search forwards the typed query into the coin picker, exact demo CA selection works, and duplicate parents stay disabled.
- Generation service rejects identical parents and supports cancellation. Browser console showed no errors during the revised flow.
- CSS includes reduced-motion rules that disable animation and smooth scrolling; operating-system preference switching was not separately tested.

The default pairing has curated offspring artwork. Other pairings use the three demo archetypes with hue variation; no live AI is connected. Family Tree, Explore, descendant counts, launch dates, and Recent Births remain illustrative local examples. The local static export is included.

Private hosting could not complete: Windows denied creation of `.git/index.lock` even after write permission was granted for that folder. No source was pushed and no hosted revision was deployed. The local site and ZIP contain the complete revised build.

## Phase 2A verification — September 26, 2026

- Production Next.js build and TypeScript check passed, including the dynamic `/api/tokens/search` endpoint.
- `npm run test:tokens`: all 9 focused tests passed. Covers decoded base58 validation, Helius request/normalization, absent optional data, non-fungible filtering, not-found, malformed payloads, sanitized failures, timeouts, Solana discovery/ranking/deduplication, bounded TTL cache/in-flight reuse, verified-only service results, optional market failure, mint identity, and three mock offspring from normalized parents.
- Live DEX Screener request for BONK returned the expected `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` mint. No Helius API key was supplied: authenticated Helius and full live search remain pending.
- Normal running API: missing key -> 503 NOT_CONFIGURED; invalid mint -> 400 INVALID_QUERY before configuration/provider access; empty query -> 200 empty list.
- Browser QA against an isolated test-only upstream interceptor: name search, direct mint lookup, click selection, Arrow Up/Down + Enter, duplicate rejection in both controls, persistent duplicate error, outside dismissal, Escape, no-results, provider failure, retry control, missing/failed image fallback, missing cap, independent parent change, parent removal, disabled generation with an empty slot, and three mock draft offspring with selected parent names.
- Parent removal cleared previous offspring and left the other parent unchanged.
- Mobile at 390x844 and 320x740: no page overflow, dialog within viewport, token rows about 62px tall, placeholder images loaded, Escape closed the modal.
- The interceptor was only in the workspace scratch folder, used a fake test key in a separate process on port 5174, and was stopped after QA. It is not part of application source, normal startup, or the delivery archive. Normal localhost:5173 uses actual providers and currently shows the missing-key state.
- Built browser chunks scanned: no HELIUS_API_KEY reference, Helius RPC URL, or test credential included.

Still to verify after adding a real key: live BONK/WIF/POPCAT/FARTCOIN discovery and metadata, exact BONK CA, live optional image/market data, and end-to-end parent selection. Test fixtures are not evidence of authenticated provider availability.

## Cost-control revision — September 27, 2026

- `npm run test:tokens`: 12 tests for normalization, zero-provider catalog hits, 10-minute discovery cache, five-candidate limit, deferred Helius, 24-hour verification cache, uncached failures, direct CA, 429/Retry-After, sanitized failures, timeout, Instant pools, worker gating, single-result/image policy and preserved lineage.
- `npm run test:queue`: 10 tests including the actual PostgreSQL migration/functions with PGlite, the rollback-only hosted QA SQL, and dispatcher policy. Covers FIFO/position, admission idempotency, active session uniqueness, no minute quota, shared worker concurrency, overlapping claim callers, actual 3,000/hour and 9,000/day boundaries, user/IP caps, lease expiry/failure recovery, anonymous access denial, search permits and fenced cache leases. Local PostgreSQL results alone do not establish hosted success.
- PGlite is development-only and has one serialized PostgreSQL connection. This is not a hosted Supabase multi-connection load test.
- All four catalog mint addresses were cross-checked against live DEX Screener Solana token-pair responses. No mint address was guessed.
- Browser: one result card, Instant badge and prepared-result message, pairing parents, variant rotation, Mutate Again reaching the unavailable custom-provider state while retaining the prepared result, catalog search without a key, and verification failure without changing parents.
- Missing services/credentials are explicit. No hosted migration, authenticated Helius call or AI job ran. The custom endpoint does not create fake queue jobs or simulated paid results.
- Current secret scan and production build are checked before handoff. Phase 2A's earlier three-offspring expectations are superseded by this revision.
- Final responsive check: 390px and 320px widths, one result card, one Mutate Again action, 62px token row, no horizontal overflow. Instant pool variation confirmed. Final browser console reported no errors on the result view.
- Final production build and TypeScript passed; final test run: 12 token/worker/pool tests and 6 PostgreSQL tests passed. Browser chunks contain no Supabase service key, Helius key, session/worker-secret environment reference, or Helius RPC URL.
- Normal custom endpoint returns 503 AI_NOT_CONNECTED; unauthenticated worker endpoint returns 401. A hosted queue/AI success is intentionally not claimed.

## Token search reliability update (2026-09-27)

Current evidence and behavior are recorded in TOKEN-SEARCH-FIX.md. The complete suite now passes 35 token/artwork/worker/resilience tests plus 10 queue/dispatcher/SQL tests. The production build passes. First requests after restart with cleared discovery cache returned five results for ramp (HTTP 200, 2.227s) and pnut (HTTP 200, 1.750s). The Supabase 201 empty-body parser failure is fixed; transient DEX retry, optional shared caching, selective artwork enrichment and stale client-request handling are covered by regression tests. Earlier entries above describe historical validation states.
