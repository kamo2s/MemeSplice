# Prepared homepage showcase

`prepared.json` contains editorial snapshots of already-completed generation results. The initial records are GasKitty (POPCAT × FARTCOIN), Boncata (BONK × POPCAT), and the image-v2 Bonkwif (BONK × WIF). Their original names and prompt versions are preserved; these are not concept-v3 outputs.

`repository.ts` joins each record to the existing, static `popularCoin` catalog. The component imports this repository directly. It has no fetch, database, generation or token-provider dependency. Parent assets come from `public/images/tokens`; offspring assets come from `public/images/showcase`. Viewing a slide only serves normal static website assets; there are no AI or provider calls. Normal hosting bandwidth still applies.

## Add another example

1. Review an existing completed offspring for artwork quality and appropriate content. Adding a showcase record must not generate an image or enqueue work.
2. Copy its already-generated WebP to `public/images/showcase/<unique-id>.webp`.
3. Append a record to `prepared.json` with a unique `id`, `prepared: true`, two existing catalog `parentTickers`, the saved offspring's `name`, `ticker`, `tagline` and local `image` path, plus its job ID and original concept/image prompt versions under `provenance`.
4. For a parent outside the existing catalog, first add its verified static record and local native artwork through the existing catalog workflow. Do not add runtime token lookup to this repository.
5. Run `npm run test:showcase` and `npm run build`, then review desktop/mobile layout. Tests should be extended if a new record introduces a new data case. The current initial-record-count assertion should be updated when intentionally expanding the collection.

Reorder JSON entries to change the sequence. No Supabase migration is required. These previews do not change draft/official status or Family Tree lineage.

## Interaction

One slide is mounted at a time. Auto-rotation uses one 7,500 ms timeout, cleaned up before every restart or unmount. It pauses during hover, keyboard focus, hidden tabs and offscreen display. Manual next/previous/dots/swipe pause until Play is chosen; hover/focus must leave before playback advances. Reduced-motion preference disables automatic playback and animation while leaving manual switching available.

`Try this splice` calls the homepage's existing `changeParents` handler, then scrolls and focuses `#create`. It never invokes Generate. The separate `Make your own` action just focuses that section.
