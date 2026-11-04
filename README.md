# song-quiz

Song guessing game for the Christmas party. Web app, runs on a laptop at the venue, phones join via QR code.

> Status: planning. Open questions are in [Open questions](#open-questions).

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

- Node.js server, `ws` WebSockets, in-memory state, no database.
- Static vanilla JS pages: `/tv` (main screen), `/play` (phone).
- Audio: YouTube IFrame Player API on the TV page (pause/resume/seek). One-time click on the TV to allow autoplay.
- Runs on the host laptop; QR encodes the laptop's LAN IP. Laptop needs internet (YouTube).

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
