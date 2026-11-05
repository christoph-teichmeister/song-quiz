import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// every module and inline script must parse (a syntax error blanks the whole page)
import { readdirSync } from 'node:fs';
for (const f of readdirSync('public/js')) {
  test(`js/${f} parses`, () => {
    const r = spawnSync(process.execPath, ['--check', `public/js/${f}`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}
for (const page of ['sim', 'brandbook']) {
  test(`${page}.html inline script parses`, () => {
    const m = readFileSync(`public/${page}.html`, 'utf8').match(/<script(?: type=module)?>([\s\S]*?)<\/script>/);
    if (!m) return;
    const f = join(mkdtempSync(join(tmpdir(), 'sq-')), page + '.mjs');
    writeFileSync(f, m[1]);
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}
