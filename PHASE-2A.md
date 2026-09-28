# Phase 2A: real Solana parent search

## Provider decision (before implementation)

Helius remains the primary authority for mint lookup and fungible-token metadata. Its documented DAS `searchAssets` filters do not provide free-text name/symbol discovery. DEX Screener's documented public search API supplies candidate mint addresses and optional market data; every displayed candidate must also resolve as a fungible asset through Helius. No website scraping or browser-to-Helius requests are used.

References checked September 26, 2026:
- https://www.helius.dev/docs/api-reference/das/searchassets
- https://www.helius.dev/docs/api-reference/das/getasset
- https://docs.dexscreener.com/api/reference

Only Solana results are eligible. Ranking favors exact ticker/name matches, then liquidity, with duplicate mints collapsed. Discovery is not an authenticity endorsement: tokens can share names and tickers. The mint address is the identity.

DEX Screener covers indexed trading pairs, not every Solana mint. Paste a mint to bypass discovery. Market cap is optional and never substituted with fully diluted valuation. Helius prices can be up to ten minutes old.

The server/API integration requires a running Next.js server; the former static export cannot execute it. Historical static output/hosting configuration is not a Phase 2A deployment. Local development and production instructions are in README.md. No AI, wallet, launch, database, or payment integration is included.

## Implementation

- Both the header dropdown and parent dialog share a 350 ms debounced search hook. Requests are cancelled and old results hidden on query change/close. Keyboard navigation, Enter, Escape, outside dismissal, loading, empty/error states and retry use the existing components.
- `GET /api/tokens/search?q=...` calls a provider-independent service. Base58 validation checks the decoded address is exactly 32 bytes, including valid off-curve addresses. Name/ticker discovery returns at most eight unique Solana mints, each verified by Helius as a fungible token. Direct CA lookup bypasses discovery.
- Helius metadata caches for five minutes; search/enrichment caches for 30 seconds. Both caches are bounded and deduplicate in-flight work. Failures are not cached, provider requests time out, and Helius fan-out is limited to four requests per search batch. Caches reset on restart and are local to each server process.
- Normalized tokens retain mint, name, ticker, image URL, USD price, optional market cap and decimals. Real token objects adapt to existing parent/offspring models. Missing or failed images use the existing flask asset. Missing market values stay absent, never fictional.
- Duplicate identity uses the case-sensitive mint address in both controls, shared parent-state validation and mock generation. Changing/removing a parent clears offspring and selected drafts without changing the other slot.
- The default showcase, Suggested Pairings, Surprise Me and illustrative Explore/Family Tree remain demo data, as permitted by the brief. Manual search has no mock fallback. Generation still produces three mock draft children from the selected parent objects.
- No secrets appear in client code. Only the server entry reads `HELIUS_API_KEY`; server-only import protection prevents accidentally bundling that entry. Provider exceptions are sanitized so URLs/credentials are not returned or logged.

## Setup and testing

Create `C:\Users\tokto\Desktop\MemeSplice\.env.local` with:

```dotenv
HELIUS_API_KEY=your_real_key_here
```

Do not use a `NEXT_PUBLIC_` prefix. `.env.local` is ignored by Git and omitted from archives. Restart the running server after adding/changing the key. No new package is required; native fetch and the existing Zod library are used.

Double-click `Start-MemeSplice.cmd`, or run `npm run dev` from the project folder. Open http://localhost:5173. Stop an existing server before starting another on that port. For production locally: `npm run build`, then `npm start`. A fresh checkout also needs `npm ci` (Node 22.13+).

1. Click Parent A and type `BONK` or `$BONK`. Select the result whose mint ends in `B263`.
2. Paste `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` to test direct lookup.
3. Select WIF, POPCAT or FARTCOIN as Parent B. Change A and confirm B stays unchanged.
4. Try the same mint in both slots. The selection must be rejected with “Choose two different memecoins to splice.”
5. Remove B. Its artwork/metadata and generated draft cards must clear; generation must be disabled.
6. Search an invalid CA, a nonsense name, and a token with no image/market cap. Check errors, placeholders, keyboard navigation, Escape, outside dismissal and mobile layout.
7. Select two different tokens and Generate Offspring. Exactly three mock drafts must use their names and retain their parent mint addresses.

Run `npm run test:tokens` for isolated provider/service/cache/validation/generation tests. These do not require an API key or make network requests. To simulate provider failure manually, temporarily use an invalid key locally and restart; restore the key afterward.

## Added files

- `.env.example`
- `PHASE-2A.md`
- `app/api/tokens/search/route.ts`
- `hooks/use-token-search.ts`
- `components/memesplice/token-search-status.tsx`
- `lib/tokens/types.ts`, `validation.ts`, `errors.ts`, `client.ts`
- `lib/tokens/providers/helius-token-provider.ts`, `dexscreener-token-provider.ts`
- `lib/tokens/server/index.ts`, `http.ts`, `cache.ts`, `token-search-service.ts`
- `scripts/test-tokens.mjs`
- `tests/tokens.test.cjs`

## Changed files

- `app/page.tsx`: mint-based parent identity and demo-pairing adapter.
- `components/memesplice/coin-picker.tsx`, `header-coin-search.tsx`: real asynchronous search and selection.
- `components/memesplice/artwork.tsx`: remote artwork and fallback.
- `lib/memesplice/types.ts`, `services.ts`: normalized token attachment, mock-generation mint validation, removed local search.
- `app/refinements.css`: artwork containment, search status and long-name handling only.
- `next.config.ts`, `package.json`, `Start-MemeSplice.cmd`: server runtime and test command.
- `.gitignore`: permit the empty `.env.example` template while ignoring actual keys.
- `README.md`, `TESTING.md`: current setup and verification record.

## Remaining limitations

No Helius key was supplied, so authenticated live Helius lookup and the complete live end-to-end search cannot yet be confirmed. Missing-key behavior is intentional. DEX Screener improves name/ticker discovery and is already included; it can miss unindexed/untraded tokens, and matching names are not proof of authenticity. Paste an exact mint when needed. Market data is optional and may be cached by providers.

No live deployment was performed. This phase requires a server-capable deployment and a server-side secret; the historical static hosting configuration cannot serve the API. AI generation and all later phases remain untouched pending approval.
