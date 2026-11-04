# song-quiz

Song guessing game for the Christmas party. Web app, runs on a laptop at the venue, phones join via QR code.

> Status: planning. Open questions are in [Open questions](#open-questions).

## Flow

1. **Lobby (TV/main screen):** runs idle in an empty room, shows "game available" and a QR code.
2. **Create session:** a phone scans the QR, creates a session, becomes host. Session code appears on the TV.
3. **Join:** other players scan/enter the code, pick a team.
4. **Start:** host starts the round. TV shows a countdown, then plays a song.
5. **Buzz:** each team has one active player (rotating) standing at the front; they buzz on their phone. Playback pauses.
6. **Verify:** the *opposing* team's phone shows Correct / Wrong. Correct = points. Wrong = buzzer team is locked for this song, playback resumes until the other team buzzes (same verification).
7. **Next song**, repeat. Leaderboard between rounds and at the end.

## Categories (picked by host)

Charts now, 80s, 90s, 2000s, Christmas, one-hit wonders, movie/TV themes, and more (playlist-based, see below).

## Robustness

- Idle timeout: after N s without activity, the TV shows a 2 s "Are you still there?" countdown; no tap resets the session to the lobby. No deadlocks if someone walks away.
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

## Open questions

- Hide the video completely (covering the iframe is against YouTube's rules of thumb but works) or show a fake visualizer?
- Point system: fixed, or faster buzz = more points?
- Team assignment: free choice or automatic?
- Does the verifier see the correct title/artist? (Proposed: yes, only the verifier.)
- Number of songs per round, max players.
