# Token artwork fix — September 27, 2026

Implemented in `C:\Users\tokto\Desktop\MemeSplice`. The local site is running at http://localhost:5173/. No deployment or AI integration was performed. Theme, layout, spacing, typography, and section order were preserved.

## Root causes

- Selection previously replaced the discovery Coin with a new Helius-only object. A missing Helius image therefore discarded a usable DEX image.
- The image component stored one URL and immediately showed the flask after that URL failed. It had no alternative-source chain.
- IPFS/Arweave URI schemes, metadata JSON, IPFS subdomain gateways, and Helius `cdn_uri` copies were not handled.
- The popular catalog used illustrative atlas images instead of native token files.
- Live upstream issues included IPFS 429 responses and a token host returning 403. POPCAT's Arweave resource declared PNG while actually containing JPEG bytes.
- During testing, an early browser image load could finish before React attached its load handler. The new timeout logic now checks the actual decoded image state too.

Next.js remote-image restrictions were not the cause: these cards use ordinary image elements.

## Resolution and selection

The ordered source list is **verified Helius/native metadata images (including Helius-provided CDN copies) → preserved DEX discovery images → metadata-JSON images → flask**. Duplicate native URLs are collapsed; an existing local replica of the same native URL is retained.

Sources retain their native URL and provenance. A separate display URL points to a local native file or the signed proxy. This keeps the actual reference URLs available to a future parent-image pipeline, without connecting AI now.

Both the client selection merge and server verification preserve discovery artwork for the exact same mint. Discovery hints persist in the existing Supabase token cache when configured, with a bounded process cache otherwise. A direct mint lookup without prior discovery can obtain a cached DEX fallback. A missing or failed image never invalidates otherwise successful token verification.

Every real-token picker and parent card uses the shared Artwork component. It tries alternatives after errors or stalled downloads and retains an already-decoded search image while checking higher-priority candidates. Parent cards have independent fallback state; changing, removing, or re-adding a token resets the appropriate component. The popular catalog, Suggested Pairings, and existing demo references to those four popular tokens use the same native files.

## Helius search policy — user-approved change

The user explicitly approved removing the Helius restriction during this fix. External name/ticker searches now enrich their at-most-five results with cached Helius artwork. The former application limit of ten Helius verifications per caller per minute was removed. Results without Helius metadata remain usable with their DEX artwork. Popular catalog searches require no provider calls.

The 24-hour verification/metadata caches, ten-minute DEX discovery cache, existing DEX request limits, and provider 429/Retry-After cooldowns remain. This can use more Helius requests than the previous selection-only policy, but repeated searches and selections reuse verification results. This section supersedes the older selection-only statements in COST-CONTROLS.md and PHASE-2A.md.

## Proxy, storage, and security

Added `GET /api/tokens/image`. Only URLs signed by the server from provider/catalog image sources are accepted. An arbitrary unsigned URL returns 403. Signing uses TOKEN_IMAGE_SIGNING_SECRET when provided, otherwise SESSION_SECRET or HELIUS_API_KEY; none is sent to the browser. A process-local random secret is only a development fallback. Multi-instance deployments should use the same configured signing secret on every instance.

Remote retrieval accepts HTTP/HTTPS without credentials or nonstandard ports. It rejects literal/local/internal hostnames, resolves DNS, rejects non-public answers, pins a validated address to the socket, and repeats those checks at every redirect. IPv4, IPv6, IPv4-mapped IPv6, private, loopback, link-local, reserved, and documentation ranges are covered. No caller cookies or authentication headers are forwarded.

- Images: seven-second total timeout, at most two redirects, three-MiB limit, twelve concurrent downloads, and a 32-MiB/200-image process cache.
- Successful binary images: cached for 24 hours in process and with browser/CDN cache headers. Failures: thirty-second bounded suppression, no replacement of other sources.
- Allowed image types: PNG, JPEG, WebP, GIF, AVIF. The response must declare a supported image type and the bytes must have a supported image signature. If two supported image types are mislabeled, the actual byte signature determines the served MIME. HTML, SVG and non-image responses are rejected. Responses use nosniff and a restrictive CSP.
- Metadata JSON: four-second timeout per gateway, 256-KiB maximum, the same DNS/redirect protections, and a 24-hour successful-result cache.
- Native popular files are bundled locally; they remain available without external hosts. No generated substitutes were added.

IPFS `ipfs://`, `ipfs://ipfs/`, path-gateway URLs and CID subdomains normalize to HTTPS candidates, with ipfs.io and dweb.link alternatives. `ar://` and `arweave://` normalize to arweave.net. The resolver supports JSON `image`, `image_url`, image entries in `properties.files`, and relative image paths. Arweave redirects are checked and followed within the same limits.

## Requested test matrix

Live checks used the user's existing local Helius key without printing it. Fallback-only cases also used an isolated provider-fixture server on port 5174; that server was stopped and its tab closed after testing. Fixture code was kept outside the project and is not used by the running app.

| Case | Image source/fallback observed | Result |
|---|---|---|
| BONK | Helius native Arweave JPEG, pinned as `bonk.jpg` | Search, Parent A, catalog and pairings loaded; verification preserved it |
| WIF | Original IPFS hosts unavailable; Helius-provided CDN native copy, pinned as `wif.jpg` | Search and selected parent retained the local image while native alternatives were checked |
| POPCAT | Helius Arweave native JPEG (upstream incorrectly says PNG), pinned as `popcat.jpg` | Correct image MIME served; search and selected parent loaded |
| FARTCOIN | IPFS gateways unavailable; Helius CDN native PNG, pinned as `fartcoin.png` | Search, selected parent and pairings loaded |
| ELON, GY9m…pump | Native Filebase/IPFS image from Helius | Header/modal search and Parent A loaded; remove/re-add passed |
| Official Elon Coin, BftU…pump | Native IPFS and Helius CDN unavailable; preserved DEX AVIF | Search and Parent B loaded the same DEX image |
| ELON, 2akX…pump | Helius native edge.uxento.io WebP | Search loaded; source preserved through verification |
| ELON, GRrt…8x8n | GMGN origin initially returned 403; Helius CDN copy worked. Final origin request also succeeded | Search loaded; verified fallback chain preserved |
| ELON, BcVR…BAGS | Helius native Axiom CDN WebP; no DEX image available | Search now loads through Helius enrichment |
| DEX image, no Helius image | Controlled fixture: DEX source survives search and verification | Browser Parent A loaded; client/server regression tests passed |
| Metadata URI only | Controlled fixture: real Arweave metadata JSON resolves its image field | Browser search and Parent A loaded using metadata source |
| IPFS image | Controlled fixture: URI normalized, unavailable public gateways then Helius CDN copy | Browser search and Parent A loaded; path/subdomain normalization tests passed |
| Missing image | Controlled fixture: all source lists empty | Flask in search and Parent A; Parent B's valid image remained intact |
| Broken/unreachable URL | Controlled fixture: invalid native host then valid DEX image | Search and Parent B fell back automatically; no flask while a usable alternative existed |

All five current ELON search results displayed artwork in the final live browser check. Names/tickers are not unique: the table identifies mint prefixes to distinguish them.

Additional browser checks: desktop header picker, modal picker, all four popular selections, two simultaneous parent images, parent changes, removal/re-addition, native images remaining loaded after the ten-second stall threshold, and no selection flicker when WIF upgrades its source list. The temporary desktop viewport override was reset afterward.

Automated verification: **25 token/artwork/worker tests + 6 database queue tests = 31 passed**. TypeScript and the production Next.js build passed. Security tests cover signature tampering, internal DNS targets, redirect validation/caps, timeouts, MIME/byte validation, size limits and cache coalescing. Live unsigned proxy request returned 403.

## Changed files

All paths below are relative to `C:\Users\tokto\Desktop\MemeSplice`.

- `components/memesplice/artwork.tsx` — independent multi-source rendering, cached-image hydration handling and visible-image preservation.
- `hooks/use-token-selection.ts` — pass the discovery Coin into verification merging.
- `lib/memesplice/types.ts` — ordered display URL list on Artwork.
- `lib/memesplice/mock-data.ts` — reuse native popular artwork in existing examples.
- `lib/tokens/types.ts` — image sources and metadata URI.
- `lib/tokens/validation.ts` — safe URL/storage-scheme normalization.
- `lib/tokens/image-sources.ts` — new shared priority, merging, gateway and metadata field rules.
- `lib/tokens/client.ts` — decode source lists and preserve discovery images in selected Coin/reference data.
- `lib/tokens/catalog.ts` — native catalog artwork.
- `lib/tokens/native-artwork.json` — new pinned image provenance and local paths.
- `lib/tokens/providers/helius-token-provider.ts` — direct, file, CDN and JSON URI extraction.
- `lib/tokens/providers/dexscreener-token-provider.ts` — discovery image provenance/gateway alternatives.
- `lib/tokens/server/cache.ts` — bounded cache reads/writes for artwork hints.
- `lib/tokens/server/shared-cache.ts` — optional persistent artwork hints using existing Supabase cache storage.
- `lib/tokens/server/token-search-service.ts` — image-preserving verification, search enrichment and mint fallback lookup.
- `lib/tokens/server/index.ts` — connect metadata resolution, search enrichment and signed delivery.
- `lib/tokens/server/safe-remote.ts` — new constrained remote image/JSON reader.
- `lib/tokens/server/token-images.ts` — new signing, metadata resolution and bounded binary cache.
- `app/api/tokens/image/route.ts` — new signed image delivery endpoint.
- `public/images/tokens/bonk.jpg`, `wif.jpg`, `popcat.jpg`, `fartcoin.png` — four native images.
- `tests/token-images.test.cjs` — new image/security regression tests.
- `scripts/test-tokens.mjs` — include the image test suite and JSON catalog data.
- `.env.example` — document the optional signing secret. The user's `.env.local` was not edited.
- `TOKEN-ARTWORK.md` — this report.

## Remaining limits

- Upstream files can disappear or all gateways can be unavailable; after every usable alternative fails the flask remains the honest fallback. A later request can retry after the short failure cache expires.
- SVG, unsupported image formats, files above three MiB, private destinations and nonstandard ports are intentionally unsupported by this proxy. A supported alternative is tried instead.
- Helius enrichment increases cold-search latency and may consume up to five uncached metadata requests per external query. Provider-imposed limits still apply even though the app's Helius quota was removed.
- Binary caching is process-local plus HTTP/CDN caching, not a persistent object-storage service. The four bundled popular images are persistent snapshots; refreshed token branding requires updating those files/provenance.
- Verification/source caches refresh after 24 hours. Existing cached responses from before the fix can require a browser reload; the server-side verification namespace was versioned to avoid stale image-less records.
- A future AI adapter must read the preserved ordered native source list and apply fallback handling; no AI requests were added by this task.

Work stops at this artwork fix pending the user's review.
