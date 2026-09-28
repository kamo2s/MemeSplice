import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const buildRoot = join(root, '.next');
mkdirSync(buildRoot, { recursive: true });
const output = mkdtempSync(join(buildRoot, 'token-tests-'));
let status = 1;
try {
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', 'lib/tokens/server/token-search-service.ts', 'lib/tokens/server/token-images.ts', 'lib/tokens/providers/helius-token-provider.ts', 'lib/tokens/providers/dexscreener-token-provider.ts', 'lib/tokens/client.ts', 'lib/tokens/server/shared-cache.ts', 'lib/tokens/search-request.ts', 'lib/memesplice/services.ts', 'lib/generation/instant-splices.ts', 'lib/generation/worker.ts', '--outDir', output, '--rootDir', '.', '--noEmit', 'false', '--incremental', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'ES2020', '--esModuleInterop', '--skipLibCheck', '--strict', '--resolveJsonModule'], { cwd: root, stdio: 'inherit' });
  if (compile.status !== 0) throw new Error('Token test compilation failed.');
  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}');
  const test = spawnSync(process.execPath, ['--test', 'tests/tokens.test.cjs', 'tests/token-images.test.cjs', 'tests/search-resilience.test.cjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, SPLICE_TEST_BUILD: output } });
  status = test.status ?? 1;
} finally {
  if (!resolve(output).startsWith(buildRoot + sep)) throw new Error('Invalid test output directory.');
  rmSync(output, { recursive: true, force: true });
}
process.exitCode = status;
