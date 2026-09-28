# Phase 2B public AI operation

## Runtime and launch requirements

Use a persistent Node 22.13+ host for the Next.js app and a supervised dispatcher process. The existing `.openai/hosting.json` static `out/` deployment cannot execute this backend. A static upload alone is not a public AI launch.

Build with `npm run build`, run `npm start` (port 5173), and run `npm run worker` continuously from the project directory. The dispatcher uses `GENERATION_WORKER_URL`, an HTTPS app `/api/generation/worker` endpoint or a loopback URL on the same machine, and a server-only `GENERATION_WORKER_SECRET`. It does not need a manual command per job.

For deployment, install the app and worker as two supervised services, configure automatic restart on failure, and allow at least 480 seconds per worker request and 500 seconds for graceful shutdown. Keep SSE streaming enabled (no proxy buffering). The dispatcher drains in-flight work on SIGTERM/SIGINT; an uncertain request never resubmits its job. Serverless hosts with shorter request limits or no persistent background process need a compatible external Node worker/app runtime before launch.

Example Linux systemd services (replace paths/account; Node must be on PATH):

```ini
# /etc/systemd/system/memesplice-web.service
[Unit]
Description=MemeSplice Next.js
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=memesplice
WorkingDirectory=/srv/memesplice
EnvironmentFile=/etc/memesplice.env
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --port 5173
Restart=always
RestartSec=5
TimeoutStopSec=500
[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/memesplice-worker.service
[Unit]
Description=MemeSplice AI dispatcher
After=network-online.target memesplice-web.service
Wants=network-online.target
[Service]
Type=simple
User=memesplice
WorkingDirectory=/srv/memesplice
EnvironmentFile=/etc/memesplice.env
ExecStart=/usr/bin/node scripts/generation-dispatcher.mjs
Restart=always
RestartSec=5
TimeoutStopSec=500
[Install]
WantedBy=multi-user.target
```

Set protected server environment values from `.env.example` in `/etc/memesplice.env` (restrict access to the service account), including `GENERATION_WORKER_URL=http://127.0.0.1:5173/api/generation/worker` for co-located services. Do not upload `.env.local` to static hosting or commit credentials. Run `sudo systemctl daemon-reload` and `sudo systemctl enable --now memesplice-web memesplice-worker`. Monitor with `systemctl status` and `journalctl -u memesplice-worker`. Terminating a local preview or sleeping a desktop is not persistent production hosting.

The reverse proxy must overwrite the selected `TRUSTED_CLIENT_IP_HEADER` and prevent direct external access to the Node port. For nginx, `proxy_set_header X-Real-IP $remote_addr;` with `TRUSTED_CLIENT_IP_HEADER=x-real-ip` is an example for a direct ingress (configure real-IP trust separately if behind another proxy). Never trust arbitrary browser-supplied forwarding headers. A blank value safely shares one IP allowance across all callers, but is a launch blocker for normal multi-user operation.

## Authoritative controls

Apply migrations 001, 002, then `202609270003_public_ai_launch.sql` once. On an existing project apply only unapplied migrations. Migration 003 preserves all jobs, drafts, costs, caches and artwork. It drops the old minute quota and spacing clock, adds shared concurrency and worker heartbeat, replaces affected RPCs, and leaves generation disabled.

`npm run configure:generation` copies these server settings to Supabase and always disables generation for review:

```dotenv
MAX_CUSTOM_GENERATIONS_PER_HOUR=3000
MAX_CUSTOM_GENERATIONS_PER_DAY=9000
MAX_CUSTOM_GENERATIONS_PER_USER_HOUR=3
MAX_AI_WORKER_CONCURRENCY=25
AI_SMOKE_TESTS_ENABLED=false
```

There is no generation-per-minute setting or intentional inter-start spacing. Historical migrations retain their original definitions so migration history remains reproducible; migration 003 supersedes and removes them. Token-search anti-abuse limits are unrelated and unchanged.

The singleton `FOR UPDATE` lock serializes admission/claim across instances. Admission reserves waiting jobs against both rolling budgets; claim repeats both started-job counts and the active leased-worker count. Failed starts retain their timestamps. Slots are infrastructure capacity: jobs wait when 25 are active, and FIFO work can start when a slot frees. Increasing concurrency does not increase generation quotas. Leases expire after five minutes without a valid stage update; failed/expired work is never automatically replayed. Image requests time out after 180 seconds and make exactly one attempt.

The dispatcher checks the authenticated worker health endpoint every three seconds, even while disabled. It fills free local slots without pacing when queued work exists; idle polling does not create paid requests. Supabase is the final global authority across dispatchers. Health refreshes `worker_seen_at`; public admission returns a clean cooling-down state if no healthy worker has been seen for 45 seconds. Existing jobs remain in the database if the worker goes offline. Settings/network/provider failures pause new dispatch until healthy.

## Enablement and recovery

Keep public disabled until the controlled checks pass. Start/verify the real dispatcher first. Public enabling is a single explicit operator update:

```sql
update public.generation_settings set enabled=true where id=true;
```

Disable with the same update using `false`; this stops new claims/admissions while allowing already-started jobs to finish. Keep private smoke testing false outside a specifically authorized test window. Do not rerun the paid smoke script as a routine health check.

On provider 429, recorded Retry-After controls the shared pause. No paid request is automatically retried. Auth failures pause indefinitely until an operator corrects credentials and explicitly clears the pause. Queued jobs remain queued. Inspect `ai_calls` STARTED/FAILED and `ai_runs` before taking any recovery action; a missing response does not prove there was no charge. Never delete a reservation to replay an uncertain image call.

## User experience and costs

Queue position is live FIFO state. Estimates use current active slots, configured concurrency and mean duration of up to 100 completed jobs in the last day, with a 120-second fallback and coarse 30-second rounding. They are approximate, not an SLA, and do not use the removed minute quota. Refresh/SSE reconnection resumes the owned job; completed drafts restore without generating. Mutate Again creates a new accounted job and preserves the prior child as an avoidance reference.

`npm run ai:costs` remains the usage-based cost report. Unknown usage/pricing remains NULL. 9000/day is a generation-count safety cap, not a guaranteed dollar cap. The optional spend-based hard stop is deferred: reliable count controls remain authoritative, while unknown/uncertain calls and estimated pricing make an exact dollar ceiling misleading. Recalculate target daily budget / measured average generation cost after more live observations.

Parent cache remains 30 days keyed by mint/fingerprint/version/model input. Native references retain 512px/153600-byte bounds. Prompts remain parent-analysis-v1, offspring-concept-v3, offspring-image-v2. Instant Splices and bundled showcase examples never enter the custom queue or call AI/search providers.

Rate-limit behavior follows [OpenAI rate-limit guidance](https://developers.openai.com/api/docs/guides/rate-limits); MemeSplice deliberately does not automatically retry paid calls.
