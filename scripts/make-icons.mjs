// node scripts/make-icons.mjs -> public/favicon.svg + app icons (the painted buzzer disc from js/disc.js)
import { launch } from '../test/e2e/harness.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)) + 'public/';
// Same disc as public/js/disc.js on a dark square; k scales the art (maskable keeps it in the 80% safe zone), rx = corner radius in 228-unit box (0 = full bleed)
const svg = (rx, k, size = '') => `<svg xmlns="http://www.w3.org/2000/svg" ${size}viewBox="-14 -14 228 228"><defs><filter id="dwob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect x="-14" y="-14" width="228" height="228" rx="${rx}" fill="#14111c"/><g transform="translate(100 100) scale(${k}) translate(-100 -100)"><g filter="url(#dwob)"><circle cx="107" cy="108" r="90" fill="#0c0616" opacity=".5"/><circle cx="100" cy="100" r="90" fill="#ff4f8b"/><path d="M10 100a90 90 0 0 0 145 70a112 112 0 0 1-145-70z" fill="#c4306a"/><path d="M41 61q18-40 59-40q-26 18-40 57q-9 9-20-17z" fill="#ffb3cb"/><circle cx="100" cy="100" r="72" fill="none" stroke="#ffd0e0" stroke-width="3.2" stroke-dasharray="17 11" stroke-linecap="round" opacity=".9" transform="rotate(-18 100 100)"/><g fill="#f6ecd8" transform="translate(100 100) rotate(-8) scale(1.27) translate(-32 -32)"><path d="M27 18v21.5a6.2 6.2 0 1 0 3.6 5.6V28l11 2.8v9.7a6.2 6.2 0 1 0 3.6 5.6V21.2z"/></g></g></g></svg>`;
writeFileSync(root + 'favicon.svg', svg(52, 1));
const b = await launch(), p = await b.newPage();
for (const [file, px, rx, k] of [['icon-512', 512, 52, 1], ['icon-192', 192, 52, 1], ['apple-touch-icon', 180, 0, 1], ['icon-maskable-512', 512, 0, .8]]) {
  await p.setViewportSize({ width: px, height: px });
  await p.setContent(`<body style="margin:0;background:transparent">${svg(rx, k, `width="${px}" height="${px}" `)}`);
  await p.screenshot({ path: root + file + '.png', omitBackground: true });
}
await b.close();
