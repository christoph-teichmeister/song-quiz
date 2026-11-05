// node scripts/make-icons.mjs -> public/favicon.svg + app icons (painted buzzer + note, same look as the share image)
import { launch } from '../test/e2e/harness.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)) + 'public/';
// 64x64 box; k scales the art (maskable keeps it inside the 80% safe zone), rx = corner radius (0 = full bleed)
const svg = (rx, k, size = '') => `<svg xmlns="http://www.w3.org/2000/svg" ${size}viewBox="0 0 64 64"><defs><filter id="r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter><clipPath id="c"><circle cx="30.5" cy="31" r="23"/></clipPath></defs><rect width="64" height="64" rx="${rx}" fill="#14111c"/><g transform="translate(32 32) scale(${k}) translate(-32 -32)" filter="url(#r)"><circle cx="34" cy="34" r="23" fill="#0c0616" opacity=".6"/><circle cx="30.5" cy="31" r="23" fill="#ff4f8b"/><path d="M7.5 31a23 23 0 0 0 37 18.3A28 28 0 0 1 7.5 31z" fill="#c4306a"/><path d="M15 23q5-10 15-10.5q-7 5-10.5 14.5q-2.5 2-4.5-4z" fill="#ffb3cb"/><path d="M26 19v20a5.4 5.4 0 1 0 3.2 4.9V26l9.6 2.4v9.2a5.4 5.4 0 1 0 3.2 4.9V21.4z" fill="#f6ecd8" transform="rotate(-8 32 32)"/></g></svg>`;
writeFileSync(root + 'favicon.svg', svg(16, 1));
const b = await launch(), p = await b.newPage();
for (const [file, px, rx, k] of [['icon-512', 512, 16, 1], ['icon-192', 192, 16, 1], ['apple-touch-icon', 180, 0, 1], ['icon-maskable-512', 512, 0, .8]]) {
  await p.setViewportSize({ width: px, height: px });
  await p.setContent(`<body style="margin:0;background:transparent">${svg(rx, k, `width="${px}" height="${px}" `)}`);
  await p.screenshot({ path: root + file + '.png', omitBackground: true });
}
await b.close();
