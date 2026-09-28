# Splice — cost-control revision

Current production audit and deployment blockers: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md). AI and Pump integration are now implemented; the early-phase notes below are historical. Production requires the web service, generation dispatcher, and `npm run worker:launches` for browser-independent launch verification.

The approved frontend now loads one offspring per splice. Six Instant pairings have prepared result pools and make no AI, token-discovery or verification calls when clicked. Mutate Again uses the custom-request path, which is intentionally unavailable until an AI adapter is separately approved and connected.

## Local start

Run `npm run dev` or double-click `Start-MemeSplice.cmd`, then open http://localhost:5173. Fresh copies require Node 22.13+ and `npm ci`. Production locally: `npm run build`, then `npm start`.

Popular BONK/WIF/POPCAT/FARTCOIN searches work immediately. Manual token selection requires successful Helius verification. Add `HELIUS_API_KEY` to `.env.local` and restart to enable it. Never use `NEXT_PUBLIC_` for secrets.

## Shared infrastructure

Supabase migrations 001–003 provide the persistent global queue, 3,000/hour and 9,000/day shared caps, three admissions per session/IP/hour, and 25 shared concurrent workers. No per-minute generation quota remains. The queue cannot fall back to process memory. See [PUBLIC-AI-OPERATIONS.md](PUBLIC-AI-OPERATIONS.md) for the required persistent Node app/dispatcher deployment.

See **COST-CONTROLS.md** for the full implementation report, file manifest, setup, environment variables, queue/SSE behavior, rate limits, cache durations, source provenance and remaining limitations. `.env.example` lists all settings. Run `npm run configure:generation` after applying the migration to store global limits. It deliberately leaves custom generation disabled. The later approved AI phase will need a real provider and `npm run worker` or an equivalent dispatcher.

```sh
npm run test:tokens
npm run test:queue
npm run typecheck
npm run build
```

The new `@electric-sql/pglite` dependency is for PostgreSQL tests only and is already installed in this checkout. Runtime uses native fetch, existing Zod, Next.js and Supabase REST/RPC. No Redis service or AI provider is connected.

Old `PHASE-2A.md`, `out/`, and static-host metadata describe historical Phase 2A/Phase 1 behavior. They are not the current deployment configuration. This version requires a server and has not been deployed.
