import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// every inline module script must parse (a syntax error blanks the whole page)
for (const page of ['index', 'play', 'admin', 'sim', 'brandbook']) {
  test(`${page}.html inline script parses`, () => {
    const m = readFileSync(`public/${page}.html`, 'utf8').match(/<script(?: type=module)?>([\s\S]*?)<\/script>/);
    if (!m) return;
    const f = join(mkdtempSync(join(tmpdir(), 'sq-')), page + '.mjs');
    writeFileSync(f, m[1]);
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}
