# Song Quiz design system

Live version with real components: `/brandbook` (public/brandbook.html). Source of truth for all tokens: `public/style.css` (`:root`). Texts: `public/i18n.js`.

## Idea
Party show, not office software. The TV is the stage (big, dark, colour carries meaning). Phones are buzzer and cards (big targets, one thing per screen). Everyone must get it at first glance, grandmother and eleven-year-old included.

## Colour (tokens)
| Token | Hex | Use |
|---|---|---|
| `--bg` | #14111c | page background |
| `--bg2` | #1d1828 | sheets, inputs |
| `--card` | #241f31 | cards, tiles |
| `--line` | #3a3348 | borders |
| `--fg` / `--mute` | #f4f1fa / #a79fb8 | text / secondary text |
| `--hot` / `--hot2` | #ff4f8b / #ff8fb3 | action (buzzer, primary button, progress, selection) |
| `--a` | #52d1ff | Team A only |
| `--b` | #ffb347 | Team B only |
| `--ok` | #5ee6a0 | right, ready, judge hints |
| `--bad` | #ff6b6b | errors, offline banner |

Rules: team colours only for teams; pink only for actions; a wrong answer is "locked", never a red alarm. White text on `--hot` is fine only for large/bold text (about 3:1).

## Type
- Display: Bricolage Grotesque 800 (titles, numbers, buttons, buzzer), `letter-spacing:-.01em`, `text-wrap:balance`.
- Body: Figtree 400/600.
- Phone: base 18 px, h1 2.2 rem, h2 1.5 rem, hints .88 rem. TV: `vw` units with a floor, e.g. `max(2vw,18px)`.
- Small uppercase labels only for `.label` (.12em). Numbers in tables `tabular-nums`.

## Layout and components
- Phone: one column, max 480 px, main action sticky at the bottom (`.sticky`), tap targets >= 48 px, main button 56 px, buzzer centred.
- TV: centred, lots of air, one thought per screen. Progress bar on top, team cards, judge pill, pause overlay, offline banner pinned to the very top.
- Components (see `/brandbook`): `.btn`, `.btn.ghost`, `.input`, `.seg`, `.tile`, `.team-card`, `.chip`, `.step`, `.judge-banner`, `.card`, `.answer`, `.cdp`/`.cd` countdown bars, `.buzz`, `.stat-grid`, `.modal`/`.sheet`.

## Logo and share image
Mark = pink circle with white note on a dark rounded square (`favicon.svg`, app icons). Wordmark "Song Quiz" in Bricolage Grotesque 800 as paths: `public/brand/*.svg` (rebuild: `uvx --from fonttools python scripts/make-brand.py`). White on dark, dark on light; never recolour or stretch; pink mark never on a team colour. Share image `public/og.png` 1200x630, poster/risograph look drawn in code (`scripts/og-card.html`, render with `node scripts/render-og.mjs`; wobbly edges via SVG displacement, paper grain, offset colour layers), Open Graph tags in index/play/brandbook; point the image URL at the custom domain once it is live.

## Motion
`rise` (.32 s, staggered) for screen changes, `pop` (.35 s) for chips/numbers/points, ripple on buzz, TV flash in team colour (700 ms, no blur), confetti (win), bubbles (draw). No glow: depth through plain shadows. `prefers-reduced-motion` switches animations off.

## Voice
German first (default), English via DE/EN switch, du-form, short sentences, everyday words. Say what to do now; give a reason when waiting; no technical words. Examples: "Buzzer-Person" not "front-person", "Schiri" not "judge", "gesperrt" not "locked", "Keine Internetverbindung. Das Spiel verbindet sich gleich wieder." One emoji as anchor per sentence at most (🎤 buzzer, 🎧 judge, 🏆).

## Rules for new screens
1. Colours/fonts only from the tokens; a new one needs an entry here and in `/brandbook`.
2. One main action per phone screen; every state visible (waiting, locked, paused, offline).
3. Texts in `i18n.js`, both languages (`i18n.test.js` enforces it).
4. Never show an answer to someone who may not see it yet (only the judge, then the reveal).
5. No `//` comment in the middle of a line in an inline script; run `npm test` and `npm run e2e`.
