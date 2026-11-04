# song-quiz

Song guessing game for the Christmas party. Web app, phones join via QR code, hosted on Firebase.

> Status: rebuilt on Firebase (hosting + realtime database). Tests: `npm test`. Not deployed until a Firebase project is configured.

## Flow

1. **Lobby (TV/main screen):** runs idle in an empty room, shows "game available" and a QR code.
2. **Create session:** a phone scans the QR, creates a session, becomes host. Session code appears on the TV.
3. **Join:** other players scan/enter the code, pick a team.
4. **Start:** host starts the round. TV shows a countdown, then plays a song.
5. **Buzz:** each team has one front-person (chosen per round) standing at the front; they buzz on their phone. Playback pauses.
6. **Verify:** the *opposing* team's phone shows Correct / Wrong. Correct = points. Wrong = buzzer team is locked for this song, playback resumes until the other team buzzes (same verification).
7. **Next song**, repeat. Leaderboard between rounds and at the end.

## Categories (picked by host)

Charts now, 80s, 90s, 2000s, Christmas, movie/TV themes, intro-only, speed (playlist-based, see below).

## Robustness

- Idle timeout: after N s without activity, the TV shows a 10-15 s "Are you still there?" countdown; no tap resets the session to the lobby. No deadlocks if someone walks away.
- Server state is in memory, reconnecting phones re-attach via a stored player token.
- Host drop: host role passes on after a grace period.

## Architecture

- Firebase (Spark, free): Hosting serves static pages, Realtime Database carries the messages. No server of our own.
- The **TV page is the game server**: it runs `game.js`, owns the state and the idle timer. Phones push actions to `/actions`; the TV applies them and writes each player's own view to `/views/<playerId>` (so only the verifier gets the answer) plus `/public`.
- Pages: `/` (TV), `/play` (phones). Audio: YouTube IFrame Player API on the TV page (one-time click for autoplay).
- TV state is mirrored in the TV browser's localStorage, so a page reload resumes the game.
- Trade-off: DB rules are open (party game). Anyone who knows the DB URL could write; delete the project afterwards.
- Songs: `public/songs/<list>.json`, listed in `public/songs/index.json`.
- Setup/deploy: `firebase login`, project + web app + Realtime Database, config in `public/firebase-config.js`, `npm run deploy`.

## Song source: YouTube

- Categories map to curated YouTube playlists (video IDs stored in `songs/<category>.json` with title and artist for verification display).
- No Data API key needed when the list is curated by hand or exported once.
- Not possible: "play backwards" (the iframe gives no access to audio). Drop it, or replace with a "first 3 seconds only / slowed down" category.
- Risks: ads before a video, region-blocked or non-embeddable videos (filter at curation time), the video is visible on the TV (answer revealed via title overlay: cover the player).

## Decisions (2026-11-04)

- No reverse mode (YouTube iframe gives no audio access). Replaced by an **intro-only** category: song stops after ~5 s.
- TV hides the video behind an animated visualizer; title/artist revealed only after verification.
- Scoring: 1 point for the title, 1 for the artist; the verifier ticks both. A **speed** category (earlier buzz = more points) is its own category.
- Two teams, players pick their team. Each round every team picks its front-person (the buzzer) again.

- Variable team size: 1 to N players per team (even 2 players total works).
- Game length is selectable: quick (5 songs) or normal (10 songs); the song count per round follows the chosen length and the category's list size.
- Idle timeout 3 min, then a 10-15 s "Are you still there?" countdown; no tap resets to the lobby.
- Playlists: I seed curated lists per category; additionally, a "channel" category: all songs of a YouTube channel the host supplies later.

## Open questions

- Which channel for the channel category (send later).
- Review of the seeded playlists.

## Live

- URL: https://song-quiz-xmas-a414536c.web.app (TV `/`, phones `/play`), Firebase project `song-quiz-xmas-a414536c`, DB in europe-west1.
- The device that opens `/` runs the game: keep that tab visible, awake and on power (hidden tabs throttle timers).
- Gotcha: Firebase Hosting caches `/` for an hour by default; `firebase.json` sets `no-cache` for everything, otherwise redeploys do not show up.
- Gotcha: `game.js` must live in `public/` (hosting only serves that folder); Firebase rejects `undefined` values, so views are JSON round-tripped before writing.
