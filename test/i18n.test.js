import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEXT_KEYS } from '../public/js/i18n.js';

const de = new Set(TEXT_KEYS.de), en = new Set(TEXT_KEYS.en);

test('German and English have exactly the same keys', () => {
  assert.deepEqual([...de].filter((k) => !en.has(k)), []);
  assert.deepEqual([...en].filter((k) => !de.has(k)), []);
});

test('every t(\'key\') used in the pages exists', () => {
  const missing = [];
  for (const f of ['public/index.html', 'public/play.html', 'public/js/rules.js']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([^']+)'\s*[,)]/g)) if (!de.has(m[1])) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('dynamic key families are complete', () => {
  const need = ['normal', 'intro', 'speed'].flatMap((k) => ['m.' + k, 'm.' + k + '.t']).concat(
    ['teams', 'listen', 'say', 'wrong', 'win', 'intro', 'speed'].flatMap((k) => ['r.' + k, 'r.' + k + '.t']),
    ['pts', 'fast', 'sharp'].map((c) => 'aw.' + c), ['win', 'loss', 'draw']);
  assert.deepEqual(need.filter((k) => !de.has(k)), []);
});
