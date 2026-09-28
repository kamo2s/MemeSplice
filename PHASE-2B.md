Current launch operations supersede historical verification notes below: see [PUBLIC-AI-OPERATIONS.md](PUBLIC-AI-OPERATIONS.md).

# MemeSplice — Phase 2B implementation report

Checked September 27, 2026. Project: `C:\Users\tokto\Desktop\MemeSplice`.

The hosted migration and OpenAI key are now configured. **Public generation remains disabled. Exactly three controlled paid tests completed successfully.** See `MemeSplice-Phase-2B-Live-Results.md` for saved images, quality findings and measured usage estimates. The private smoke switch has been returned to false.

The production build and automated tests pass, and the app runs at http://localhost:5173. No frontend styling or layout was redesigned. An additional regression test now covers the fourth-source native-image fallback found during live testing.

## 1. Files created

Paths below are relative to the project folder above.

- `lib/ai/config.ts`, `types.ts`, `schemas.ts`, `pricing.ts`, `generation-provider.ts`
- `lib/ai/providers/openai-http.ts`, `openai-text-provider.ts`, `openai-image-provider.ts`
- `lib/ai/services/store.ts`, `supabase-store.ts`, `image-preparation-service.ts`, `offspring-generation-service.ts`
- `lib/ai/prompts/parent-analysis.ts`, `offspring-concept.ts`, `offspring-image.ts`
- `app/api/generation/session/route.ts`, `app/api/generation/smoke/route.ts`
- `supabase/migrations/202609270002_ai_generation.sql`
- `scripts/test-ai.mjs`, `ai-smoke.mjs`, `ai-cost-report.mjs`, `setup-ai-storage.mjs`, `ai-plan.mjs`
- `tests/ai.test.cjs`, `ai-database.test.mjs`, `generation-client.test.cjs`
- `PHASE-2B.md` — copy of this report.

## 2. Files changed

- `.env.example`: blank server-only AI configuration placeholders.
- `package.json`, `package-lock.json`: direct `sharp` dependency and developer commands.
- `lib/memesplice/types.ts`: persisted generation job ID and creation timestamp.
- `lib/generation/types.ts`, `provider.ts`, `server.ts`, `worker.ts`: real provider integration, mutation ancestry, paid-call protection and atomic draft completion.
- `app/api/generation/jobs/route.ts`: established session requirement, strict mutation inputs and recovery by request ID.
- `app/api/generation/worker/route.ts`: real provider and longer execution timeout.
- `hooks/use-generation-job.ts`: refresh/resume, previous-result restoration, double-click protection and stale-event protection.
- `app/page.tsx`: Mutate Again behavior only; same parents and previous-concept avoidance.
- `scripts/generation-dispatch-policy.mjs`, `tests/dispatcher.test.mjs`: account for the longer AI request window while retaining rate-derived dispatch timing.

Existing credentials in `.env.local` were not changed.

## 3. Database migration

Run **the entire** `supabase/migrations/202609270002_ai_generation.sql` file once in your existing project's SQL Editor, after the already-applied Phase 2A migration. An identical delivery copy accompanies this report.

It is an additive transaction using the existing schema. It adds:

- `ai_runs`: one configuration, reference summary, concept and outcome per job.
- `ai_calls`: durable unique reservations and usage for `parent_a`, `parent_b`, `concept`, `image`.
- `offspring`: persisted draft results linked to generation jobs.
- Mutation/smoke columns on `generation_jobs`.
- Shared provider-pause and smoke-cap columns on `generation_settings`.
- A composite parent-analysis cache key including mint, fingerprint and prompt version.
- Functions `splice_enqueue_ai`, `splice_claim_ai`, `splice_ai_begin`, `splice_ai_reserve`, `splice_ai_pause`, `splice_complete_ai`; the existing `splice_claim` delegates to the new shared limiter.

New tables and functions are restricted to the server role, with RLS enabled. The migration does not turn generation on.

**Hosted application is confirmed.** The new tables and settings are accessible, and all three real jobs completed through the new functions with persisted drafts and call ledgers. No migration errors remain. Do not rerun the successfully applied migration: it intentionally uses ordinary one-time migration statements.

## 4. Storage configuration

The real hosted public bucket **`offspring` has already been created and verified**, with a 5 MB object limit and `image/webp` MIME restriction. A tiny test image was uploaded, read back byte-for-byte and deleted successfully.

No further Storage dashboard action is needed. `npm run ai:storage` safely verifies or creates this configuration through the Storage API. It refuses to silently alter a conflicting existing configuration.

## 5. Exact environment variables

Add the following to the project's `.env.local`. Replace only the key placeholder with your real key privately. Configuration values below are the implemented defaults; they may also be left blank except for the key when testing.

```dotenv
OPENAI_API_KEY=YOUR_PRIVATE_OPENAI_API_KEY
AI_PROVIDER=openai
AI_TEXT_MODEL=gpt-4.1-mini
AI_IMAGE_MODEL=gpt-image-2.5-flare
AI_IMAGE_QUALITY=low
AI_PARENT_REFERENCE_MAX_EDGE=512
AI_PARENT_REFERENCE_MAX_BYTES=153600
AI_PROMPT_VERSION_PARENT=parent-analysis-v1
AI_PROMPT_VERSION_CONCEPT=offspring-concept-v3
AI_PROMPT_VERSION_IMAGE=offspring-image-v2
AI_SMOKE_TESTS_ENABLED=false
AI_SMOKE_APP_URL=http://localhost:5173
```

Keep your existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `GENERATION_WORKER_SECRET`, Helius/image configuration and generation-limit variables. The worker secret must be at least 32 characters. Never add `NEXT_PUBLIC_` to any secret. Restart the server after environment changes.

## 6–8. Models and quality

**Text:** `gpt-4.1-mini`, selected as an inexpensive model supporting both image input for parent analysis and strict Structured Outputs. The model remains configurable. [Official model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

**Image:** `gpt-image-2.5-flare`, as requested. **Quality: low**, one square 1024 × 1024 output, WebP. The adapter sends `n=1`, uses edits with one or two actual prepared parent references, and uses text-only generation when neither reference is available. No streaming, quality upgrade, upscale request or automatic paid retry. [Model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image generation guide](https://developers.openai.com/api/docs/guides/image-generation)

## 9. Exact one-offspring pipeline

1. Establish a signed session; enqueue with a stable request ID.
2. Supabase admits and claims the job under the existing shared limits and lease.
3. `ANALYZING`: prepare native parent references and load/analyze each parent.
4. `SPLICING`: make one structured concept call and validate the result.
5. `GENERATING`: reserve and make exactly one image call for an accepted concept.
6. `FINALIZING`: validate/encode the image, upload it, and atomically complete the job with a draft database record.
7. `COMPLETE`: display one saved offspring.

An uncached successful job needs two parent-analysis calls, one concept call and one image call. Cached parents remove their analysis calls. A failure stops the pipeline, so a failed job can have zero image calls. Unique paid-stage reservations prevent a second image call for the same job, including uncertain provider responses.

## 10. Parent-analysis cache

Profiles are cached for 30 days by mint, fingerprint and parent prompt version. The fingerprint includes verified name/ticker, metadata URI, reference-byte fingerprint and text model. Changed input or model misses the old entry. A shared lease prevents concurrent workers from independently paying for the same analysis; a waiting worker fails safely if the other analysis does not become available in time.

## 11. Native parent-image preparation

Uses the existing native artwork candidate ordering; no atlas substitutes. Remote fetches use the existing SSRF protections, byte limits and timeouts. Sharp validates raster data, caps decoded pixels, applies orientation, removes metadata, preserves aspect ratio/alpha, and encodes WebP at a maximum 512-pixel edge and 153,600 bytes. Smaller inputs are not enlarged. Oversized references are reduced again. Unavailable or invalid artwork becomes a text-only parent input.

## 12. Prompt versions

- `parent-analysis.ts`: `parent-analysis-v1`
- `offspring-concept.ts`: `offspring-concept-v3`
- `offspring-image.ts`: `offspring-image-v2`

Versions are saved per run. Unknown version names fail before provider spending; register an actual new template before selecting it. Metadata is bounded and passed as untrusted data. Prompts request one centered subject inheriting visible traits from both parents, without text, financial promises or official endorsement claims.

## 13. Structured Output schema

Parent profiles require subject, species/object, visual traits, primary colors, accessories, expression, personality traits, meme traits, style and distinctive features.

Concepts require name, ticker, tagline, lore, 3–5 traits, three DNA percentages, visual direction, inherited traits from each parent, new mutation traits and image prompt details. The provider receives strict JSON Schema with all fields required and extra properties forbidden. Server-side Zod adds string/array limits, ticker validation, integer ranges and the exact **DNA total of 100**. Invalid output stops before image generation. [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs)

## 14. Mutate Again

Creates a new queued custom job for the same parents, consumes the normal allowance and preserves the prior record. The prior custom concept or prepared Instant Splice is supplied as an avoidance constraint. Reusing the exact previous name is rejected. Broader visual distinctness still requires live output inspection.

## 15–16. Persistent records and images

Drafts are stored in `offspring`, with the complete display result also persisted on `generation_jobs`. Concepts/configuration are in `ai_runs`. Generated image objects use `offspring/custom/<job-id>/offspring.webp` in Supabase Storage; their public URLs are persisted with the result.

Refresh resumes an owned active job or restores the most recently completed result without creating a job. Uncertain admission is recovered by the original request ID. Drafts are **not** registered as launched coins or official Family Tree lineage. Database records are private; artwork URLs are public.

## 17. Usage and cost records

Per-job records include provider, models, quality, prompt/pricing versions, parent-reference availability/dimensions/bytes/fingerprint, concept, timing and failure stage/category. Per-call records include stage, model, state, timestamps, request/response IDs, token usage, estimated USD and error category. Unknown usage or unsupported model pricing stays `null`, not zero.

`npm run ai:costs` reports known text/image/total estimates, failures, uncertain calls, missing-cost calls, mean and median for fully measured jobs across the most recent 1,000 runs. Pricing is centralized in `lib/ai/pricing.ts`; estimates are not billing invoices. Do not infer a $0.01 job cost. Review real usage and the OpenAI bill before deriving an affordable daily limit from a chosen target budget.

## 18–19. Current shared limits and enabled state

Verified directly against the hosted project:

| Setting | Value |
| --- | ---: |
| Global starts/minute | No quota |
| Shared concurrent workers | 25 |
| Global starts/hour | 3,000 |
| Global starts/day | 9,000 |
| Custom jobs/user/hour | 3 |
| `enabled` | **false** |

Supabase remains authoritative across workers: singleton row locking enforces rolling hourly/day counts and shared worker concurrency. No minute quota or start spacing remains after migration 003. Instant Splices use no custom jobs, AI calls or custom quota.

## 20. Verification results

- **64 automated tests passed across validation runs:** 35 token/search, 10 queue/dispatcher/launch-limit, 19 AI/database/client tests. All 19 AI tests and the production build were rerun after the native-image fallback fix.
- Production compilation, TypeScript checks and static-page generation passed.
- New migration applied successfully to an isolated PostgreSQL-compatible PGlite test database. Existing launch-limit SQL also passed on the extended schema.
- Mocked AI tests cover one concept/image, native reference preparation, missing references, cache hits/misses, strict parsing/DNA, mutation avoidance, provider metadata/costs, text/image/storage failures and no paid retries.
- Database tests cover disabled public generation, guarded smoke admission, quotas, provider pause, unique call reservations, lease/stage validation and atomic persistent draft completion.
- Client tests exercise the actual hook for refresh/resume, pending-request recovery, double-click prevention and stale SSE events.
- Live HTTP checks: homepage/search work; session cookie is HttpOnly; custom generation is blocked without a key; smoke endpoint is disabled; worker rejects unauthenticated calls.
- Real hosted Supabase authentication/settings and Storage upload/readback/cleanup passed.
- Browser bundle scan found none of the configured secret values; `.env.example` secret placeholders are empty.

The hosted schema and three real OpenAI generations are now verified. Usage-based estimates total $0.05619, averaging $0.01873 per generation. Visual findings and the WIF fallback fix are documented in the live-results report. Automated provider tests continue to use mocks.

## 21–22. Add the key and run only the first three live tests

**The first three tests below have already been completed. Do not rerun them now.** These commands are retained as operating documentation for a later explicitly authorized test window. The migration and key are already configured, and the smoke switch is currently false. A future authorized window requires `AI_SMOKE_TESTS_ENABLED=true`, `generation_settings.enabled=false`, and a server restart. From a terminal in the project folder:

```powershell
npm run ai:smoke
```

This is a dry plan and spends nothing. When ready for exactly three paid generations:

```powershell
npm run ai:smoke -- --run --confirm-paid
npm run ai:costs
```

The script executes BONK × WIF, POPCAT × FARTCOIN and BONK × POPCAT sequentially through authenticated developer routes and the database queue. It stops on any error without retrying and writes `smoke-results.json`. The normal 3/user/hour limit still applies. A separate lifetime smoke-admission cap defaults to five jobs; this script starts only three. No background dispatcher is needed for this manual run.

Inspect those three images before any further spending: recognizable inheritance from both parents, one subject, no unwanted text, visual quality and distinctness. Inspect `ai_runs.references_info` for both native reference flags, `ai_calls` for exactly one concept/image stage and usage, `offspring` for draft records, Storage for images, and the queue for `COMPLETE`.

Then set `AI_SMOKE_TESTS_ENABLED=false` and restart. **Stop there.** Do not rerun the script, run a large batch, or enable public generation until the outputs and costs have been reviewed. If a request times out, inspect its existing job/call ledger before taking any action; an uncertain response can still have incurred a charge.

## 23. Manual Supabase steps

No further SQL or Storage setup is required. The new migration and Storage configuration are confirmed on the hosted project. The existing Secret API key authenticates successfully.

Authentication errors pause new AI calls indefinitely; rate-limit responses pause them for the provider-specified Retry-After period. If credentials are corrected after an authentication failure, inspect the failed job and then explicitly clear the provider pause in SQL Editor while leaving generation disabled:

```sql
update public.generation_settings
set ai_paused_until = '-infinity', ai_pause_reason = null
where id = true;
```

Do not use this to bypass an unresolved provider problem.

## 24. OpenAI account requirements

The configured key successfully used both Responses and Images APIs for the three smoke tests. No organization-verification or model-access block was encountered. OpenAI documents that organization verification may be required for GPT Image access on other accounts. [Image API requirements](https://developers.openai.com/api/docs/guides/image-generation)

## 25. Remaining limits and deliberately deferred work

- The first three paid tests are complete. User quality review remains outstanding; WIF's missing reference has been fixed without another paid generation, and decorative exclamation marks appeared in two images.
- `npm run ai:plan` writes a planning manifest for later prompt comparisons; `npm run ai:plan -- --batch` writes the future prepared-Instant-Splice batch plan. Neither command calls providers. Actual paid A/B/batch execution and promotion into the prepared catalog are deferred until quality approval.
- Output inheritance, novelty and absence of text are prompt goals that need manual inspection; automated validation cannot guarantee visual quality.
- A failed final database write can leave an uploaded image without a completed draft. The call ledger is retained; the worker does not regenerate it automatically. Such objects require reviewed cleanup/recovery.
- A process crash can leave a call reservation with unknown cost until compared with provider billing. Expired jobs are failed rather than retried automatically.
- Hosting must support Node/Sharp and the worker's request duration (configured up to 480 seconds). Short-lived serverless limits may require a separate worker host.
- At the configured daily capacity, the eventual spend depends on measured output cost. Capacity is not a verified budget guarantee.

No public enabling, launch transaction, large AI image batch, or official lineage registration was performed.
