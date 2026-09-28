# Dependency review — 2026-09-28

Scope: production dependency versions in package-lock.json, npm advisory results, and the installed consumers in Splice. This is a focused review, not an exhaustive penetration test or a guarantee that the application is free of vulnerabilities.

## Compatible remediation

- Anchor's transitive `toml` was overridden from 3.0.0 to 4.2.0 to address [prototype pollution](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j) and [uncontrolled recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf). Anchor's parse API is exercised by the compatibility test.
- Jayson and Solflare's transitive `uuid` versions were overridden to 11.1.1 to address [the buffer-related advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Their v4 API and the real Solflare SDK module load are exercised by the compatibility test.
- Pump SDK, wallet adapters, Anchor, and web3 major versions were preserved. The launch and wallet regression suite passes after these overrides.

## Remaining advisories

| Package | Advisory | Assessment and limits |
| --- | --- | --- |
| bigint-buffer 1.1.5 | [High: toBigIntLE buffer overflow](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) | Arrives through Solana buffer-layout-utils. Inspected integer helpers convert fixed-width Buffer slices of 8, 16, 24, or 32 bytes. No direct app call to the vulnerable conversion was found. Tests exercise boundary values and reject invalid input at the layout boundary. No official patched version was identified during this review. The local Windows installation uses the JavaScript fallback; Linux native-addon behavior has not been tested. This remains an unresolved dependency advisory. |
| stream-json 1.9.1 | [Moderate: nested-input filter denial of service](https://github.com/advisories/GHSA-528h-pc64-c93x) | Arrives through Jayson. Inspected consumer code uses StreamValues/Verifier; no Splice use of the affected pick/ignore/filter/replace paths was found. This is a reachability assessment, not proof of impossibility. A forced major upgrade changes module/import compatibility and was not applied to the production RPC stack. |

The follow-up advisory query still reports these two advisories. There is no zero-advisory claim. Recheck official upstream releases, lockfile advisories, and these use paths when upgrading Solana/RPC dependencies. Do not suppress the findings or use `npm audit fix --force` as a substitute for compatibility review.

## Validation

- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: succeeds; existing optional peer warnings remain.
- `npm run test:dependencies`: TOML/UUID compatibility and bounded bigint layout behavior pass.
- Functional regression tests, TypeScript, production build and lint pass. Lint retains seven existing image-optimization warnings; these are unrelated to the security advisories.

No secret values, wallet keys, production limits, or launch flags were changed by this dependency work.
