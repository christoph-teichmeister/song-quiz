// node scripts/render-og.mjs  -> public/og.png (needs playwright-core and Chrome, see test/e2e/harness.js)
import { launch } from '../test/e2e/harness.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const b = await launch(), p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('file://' + root + 'scripts/og-card.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
await p.screenshot({ path: root + 'public/og.png' }); await b.close();
