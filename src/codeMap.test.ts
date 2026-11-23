// The code map in docs/code-map/ is committed so that no session has to index the
// code. This test runs the script that writes it in --check mode and fails, with
// the script's own message, while the committed files are not what the sources give.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');

describe('code map', () => {
  it('docs/code-map/ matches the sources', () => {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/dev/code-map.mjs'), '--check'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || 'The code map is out of date. Run: node scripts/dev/code-map.mjs').trim());
    expect(run.status).toBe(0);
  }, 60_000);
});
