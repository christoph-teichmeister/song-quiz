import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, join, act, tick, view, T } from './public/game.js';

const songs = [{ id: 'a', title: 'T1', artist: 'A1' }, { id: 'b', title: 'T2', artist: 'A2' }];
function setup() {
  let now = 0;
  const s = createSession('host', now);
  const h = s.hostId, b = join(s, 'bob', now).id;
  act(s, h, { type: 'team', team: 'A' }, now);
  act(s, b, { type: 'team', team: 'B' }, now);
  assert.equal(act(s, h, { type: 'start', list: 'x', songs, length: 1 }, now), null);
  assert.equal(s.phase, 'howto');
  act(s, h, { type: 'ack' }, now); act(s, b, { type: 'ack' }, now);       // both players confirm the rules
  assert.equal(s.phase, 'pickfront');
  act(s, h, { type: 'ready' }, now); act(s, b, { type: 'ready' }, now);
  now += T.countdown; tick(s, now);
  assert.equal(s.phase, 'playing');
  return { s, h, b, now };
}

test('no spare player: opponent judges and both teams are locked after a wrong answer', () => {
  const { s, h, b, now } = setup();
  assert.equal(s.judge, null);
  act(s, h, { type: 'buzz' }, now);
  assert.equal(view(s, h, now).answer, undefined);        // buzzer must not see the answer
  assert.ok(view(s, b, now).answer);                       // verifier does
  assert.equal(act(s, h, { type: 'verify', title: true }, now), 'judge only');
  act(s, b, { type: 'verify', title: false, artist: false }, now);
  assert.equal(s.phase, 'reveal');                         // the verifier saw the answer, so the song is over
  tick(s, now + T.reveal);
  assert.equal(s.phase, 'end');
});

test('with a judge: wrong answer locks only the buzzer, other team may buzz, judge decides', () => {
  let now = 0;
  const s = createSession('hanna', now);
  const h = s.hostId, b = join(s, 'ben', now).id, j1 = join(s, 'jo', now).id, j2 = join(s, 'jay', now).id;
  for (const [id, t] of [[h, 'A'], [j1, 'A'], [b, 'B'], [j2, 'B']]) act(s, id, { type: 'team', team: t }, now);
  act(s, h, { type: 'start', list: 'x', songs, length: 1 }, now);
  act(s, h, { type: 'skiphowto' }, now);
  act(s, h, { type: 'front', id: h }, now); act(s, b, { type: 'front', id: b }, now);
  act(s, h, { type: 'ready' }, now); act(s, b, { type: 'ready' }, now);
  assert.ok([j1, j2].includes(s.judge));                   // never a front-person
  now += T.countdown; tick(s, now);
  act(s, h, { type: 'buzz' }, now);
  assert.equal(act(s, b, { type: 'verify', title: true }, now), 'judge only');
  assert.equal(view(s, b, now).answer, undefined);
  assert.ok(view(s, s.judge, now).answer);
  act(s, s.judge, { type: 'verify', title: false, artist: false }, now);
  assert.equal(s.phase, 'playing');
  assert.equal(act(s, h, { type: 'buzz' }, now), 'cannot buzz');
  act(s, b, { type: 'buzz' }, now);
  act(s, s.judge, { type: 'verify', title: true, artist: true }, now);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.teams.B.score, 2);
});

test('idle: prompt after 3 min, reset 15 s later, activity cancels', () => {
  const s = createSession('host', 0);
  assert.equal(tick(s, T.idle), null);
  assert.ok(s.promptUntil);
  act(s, s.hostId, { type: 'team', team: 'A' }, T.idle + 1000);
  assert.equal(s.promptUntil, 0);
  tick(s, T.idle + 1000 + T.idle);
  assert.equal(tick(s, T.idle * 2 + 1000 + T.prompt), 'reset');
});

test('start needs both teams', () => {
  const s = createSession('host', 0);
  act(s, s.hostId, { type: 'team', team: 'A' }, 0);
  assert.equal(act(s, s.hostId, { type: 'start', songs, list: 'x' }, 0), 'both teams need a player');
});

test('after a reveal the next song starts with a countdown, fronts rotate', () => {
  let now = 0;
  const s = createSession('hanna', now);
  const h = s.hostId, b = join(s, 'ben', now).id, h2 = join(s, 'hugo', now).id;
  for (const [id, t] of [[h, 'A'], [h2, 'A'], [b, 'B']]) act(s, id, { type: 'team', team: t }, now);
  act(s, h, { type: 'start', list: 'x', songs, length: 2 }, now);
  act(s, h, { type: 'skiphowto' }, now);
  const first = s.teams.A.front;
  act(s, first, { type: 'ready' }, now); act(s, b, { type: 'ready' }, now);
  now += T.countdown; tick(s, now);
  act(s, first, { type: 'buzz' }, now);
  act(s, s.judge, { type: 'verify', title: true, artist: true }, now);
  const planned = s.next.A;                                // announced during the reveal
  now += T.reveal; tick(s, now);
  assert.equal(s.phase, 'countdown');
  assert.notEqual(s.teams.A.front, first);
  assert.equal(s.teams.A.front, planned);
});

test('end of game: per-player stats and score timeline', () => {
  const { s, h, b, now } = setup();
  act(s, h, { type: 'buzz' }, now + 1500);
  act(s, b, { type: 'verify', title: true, artist: false }, now + 1600);   // no spare player: opponent judges
  const v = view(s, h, now);
  assert.equal(v.stats, null);                                             // only shown once the game ended
  tick(s, now + 1600 + T.reveal);
  assert.equal(s.phase, 'end');
  const st = view(s, h, now).stats.find((p) => p.id === h);
  assert.deepEqual([st.buzzes, st.right, st.wrong, st.pts, st.avgMs], [1, 1, 0, 1, 1500]);
  assert.deepEqual(view(s, h, now).timeline, [{ A: 0, B: 0 }, { A: 1, B: 0 }]);
});

test('custom length is clamped to 1..50 and works with 1 song', () => {
  const s = createSession('hanna', 0), b = join(s, 'ben', 0).id;
  act(s, s.hostId, { type: 'team', team: 'A' }, 0); act(s, b, { type: 'team', team: 'B' }, 0);
  act(s, s.hostId, { type: 'start', list: 'x', songs, length: 0 }, 0);
  assert.equal(s.settings.length, 10);
  s.phase = 'lobby'; act(s, s.hostId, { type: 'start', list: 'x', songs, length: 1 }, 0);
  assert.equal(view(s, s.hostId, 0).total, 1);
  s.phase = 'lobby'; act(s, s.hostId, { type: 'start', list: 'x', songs, length: 999 }, 0);
  assert.equal(s.settings.length, 50);
});

// 2 teams of 2: A = host+jo, B = ben+jay; returns the session in 'playing' (everyone ready, countdown over)
function four(mode = 'normal', length = 2) {
  let now = 0;
  const s = createSession('hanna', now);
  const h = s.hostId, jo = join(s, 'jo', now).id, b = join(s, 'ben', now).id, jay = join(s, 'jay', now).id;
  for (const [id, t] of [[h, 'A'], [jo, 'A'], [b, 'B'], [jay, 'B']]) act(s, id, { type: 'team', team: t }, now);
  act(s, h, { type: 'start', list: 'x', songs, length, mode }, now);
  act(s, h, { type: 'skiphowto' }, now);
  const fa = s.teams.A.front, fb = s.teams.B.front;
  act(s, fa, { type: 'ready' }, now); act(s, fb, { type: 'ready' }, now);
  now += T.countdown; tick(s, now);
  return { s, h, fa, fb, now };
}

test('speed mode: double points count from the song start, not from the resume after a wrong answer', () => {
  let { s, fa, fb, now } = four('speed');
  act(s, fa, { type: 'buzz' }, now + 2000);
  act(s, s.judge, { type: 'verify', title: false, artist: false }, now + 2500);  // A wrong
  now += 60000;                                                                   // song is a minute in
  act(s, fb, { type: 'buzz' }, now + 1000);
  assert.ok(s.buzz.at > T.speedMs);
  act(s, s.judge, { type: 'verify', title: true, artist: true }, now + 1500);
  assert.equal(s.teams.B.score, 2);                                               // not 4
});

test('title and artist score once: the other team can only win what is still open', () => {
  let { s, fa, fb, now } = four();
  act(s, fa, { type: 'buzz' }, now);
  act(s, s.judge, { type: 'verify', title: true, artist: false }, now);           // A: title
  assert.deepEqual(view(s, fa, now).got, { title: 'A', artist: null });
  act(s, fb, { type: 'buzz' }, now);
  act(s, s.judge, { type: 'verify', title: true, artist: true }, now);            // judge ticks both, title is already gone
  assert.equal(s.teams.A.score, 1);
  assert.equal(s.teams.B.score, 1);
  assert.equal(s.phase, 'reveal');                                                // both parts are won
});

test('the judge has no time limit: a ruling long after the speaking time still counts', () => {
  const { s, fa, now } = four();
  act(s, fa, { type: 'buzz' }, now);
  tick(s, now + 10 * 60 * 1000);
  assert.equal(s.phase, 'verify');                                                // nothing times out, the game waits for the judge
  assert.equal(act(s, s.judge, { type: 'verify', title: true, artist: true }, now + 10 * 60 * 1000), null);
  assert.equal(s.teams[s.players[fa].team].score, 2);
});

test('misfire: back to the song, nobody locked, no stats', () => {
  const { s, fa, now } = four();
  act(s, fa, { type: 'buzz' }, now + 1000);
  assert.equal(act(s, fa, { type: 'misfire' }, now), 'judge only');
  act(s, s.judge, { type: 'misfire' }, now + 1200);
  assert.equal(s.phase, 'playing');
  assert.deepEqual(s.locked, []);
  assert.deepEqual(s.stats, {});
  act(s, fa, { type: 'buzz' }, now + 3000);                                        // may buzz again
  assert.equal(s.phase, 'verify');
});

test('host skip: ends a stuck song, others cannot', () => {
  const { s, h, fa, now } = four();
  assert.equal(act(s, fa === h ? s.teams.B.front : fa, { type: 'skip' }, now), 'host only');
  assert.equal(act(s, h, { type: 'skip' }, now), null);
  assert.equal(s.phase, 'reveal');
  assert.equal(act(s, h, { type: 'skip' }, now), 'not now');
});

test('host skip in pickfront starts the countdown', () => {
  let now = 0;
  const s = createSession('hanna', now), b = join(s, 'ben', now).id;
  act(s, s.hostId, { type: 'team', team: 'A' }, now); act(s, b, { type: 'team', team: 'B' }, now);
  act(s, s.hostId, { type: 'start', list: 'x', songs, length: 1 }, now); act(s, s.hostId, { type: 'skiphowto' }, now);
  assert.equal(s.phase, 'pickfront');
  act(s, s.hostId, { type: 'skip' }, now);
  assert.equal(s.phase, 'countdown');
});

test('idle reset never fires while a song is running', () => {
  const { s, now } = four();
  assert.equal(tick(s, now + T.idle * 3), null);
  assert.equal(s.promptUntil, 0);
});

test('the judge is not the same person twice in a row when there is a choice', () => {
  for (let i = 0; i < 30; i++) {
    const { s, h, fa, now } = four('normal', 2);
    const first = s.judge;
    act(s, fa, { type: 'buzz' }, now); act(s, first, { type: 'verify', title: true, artist: true }, now);
    tick(s, now + T.reveal);
    assert.equal(s.phase, 'countdown');
    assert.notEqual(s.judge, first);
  }
});

test('someone who joins mid-game has no team and cannot take one', () => {
  const { s, now } = four();
  const late = join(s, 'late', now).id;
  assert.equal(act(s, late, { type: 'team', team: 'A' }, now), 'bad');
  assert.equal(view(s, late, now).me.team, null);
});

test('pause is host only and only while a song is on', () => {
  const { s, h, b, now } = setup();
  assert.equal(act(s, b, { type: 'pause' }, now), 'host only');
  assert.equal(act(s, b, { type: 'resume' }, now), 'host only');
  assert.equal(act(s, h, { type: 'resume' }, now), 'not now');
  assert.equal(act(s, h, { type: 'pause' }, now), null);
  assert.equal(view(s, h, now).paused, true);
  assert.equal(act(s, h, { type: 'resume' }, now), null);
  assert.equal(view(s, h, now).paused, false);
  const lobby = createSession('x', 0);
  assert.equal(act(lobby, lobby.hostId, { type: 'pause' }, 0), 'not now');
});

test('paused: every other action is refused and tick changes nothing', () => {
  const { s, h, b, now } = setup();
  act(s, h, { type: 'pause' }, now);
  for (const type of ['buzz', 'skip', 'misfire', 'verify', 'front', 'ready', 'ack']) assert.equal(act(s, h, { type, a: 1 }, now), 'paused');
  assert.equal(act(s, b, { type: 'buzz' }, now), 'paused');
  assert.equal(tick(s, now + T.idle * 5), null);
  assert.equal(s.phase, 'playing');
  assert.equal(s.promptUntil, 0);
});

test('resume shifts the countdown by the paused time', () => {
  const { s, h, b } = setup();
  let now = 100000;
  s.phase = 'countdown'; s.until = now + T.countdown;
  act(s, h, { type: 'pause' }, now + 1000);
  tick(s, now + T.countdown + 60000);
  assert.equal(s.phase, 'countdown');
  act(s, h, { type: 'resume' }, now + 1000 + 60000);
  assert.equal(s.until, now + T.countdown + 60000);
  tick(s, now + T.countdown + 60000 - 1);
  assert.equal(s.phase, 'countdown');
  tick(s, now + T.countdown + 60000);
  assert.equal(s.phase, 'playing');
});

test('resume keeps the intro clock: paused time does not eat the 5 seconds', () => {
  let now = 0;
  const s = createSession('host', now), h = s.hostId, b = join(s, 'bob', now).id;
  act(s, h, { type: 'team', team: 'A' }, now); act(s, b, { type: 'team', team: 'B' }, now);
  act(s, h, { type: 'start', list: 'x', songs, length: 1, mode: 'intro' }, now);
  act(s, h, { type: 'skiphowto' }, now); act(s, h, { type: 'ready' }, now); act(s, b, { type: 'ready' }, now);
  now += T.countdown; tick(s, now);
  now += 3000; act(s, h, { type: 'pause' }, now);
  now += 600000; act(s, h, { type: 'resume' }, now);
  now += 1900; tick(s, now);
  assert.equal(s.phase, 'playing');
  now += 200; tick(s, now);
  assert.equal(s.phase, 'reveal');
});

test('resume shifts the answer bar of a pending buzz and the buzz time stays right', () => {
  const { s, h, b, now } = setup();
  act(s, h, { type: 'buzz' }, now + 1000);
  const until = s.buzz.until;
  act(s, h, { type: 'pause' }, now + 2000);
  act(s, h, { type: 'resume' }, now + 52000);
  assert.equal(s.buzz.until, until + 50000);
  assert.equal(s.phase, 'verify');
  act(s, b, { type: 'misfire' }, now + 53000); // back to the song: playMs is the song time of the buzz, unaffected by the pause
  assert.equal(s.playMs, 1000);
  assert.equal(s.phase, 'playing');
});

test('a paused reveal does not move on, and resumes with its full time left', () => {
  const { s, h, now } = setup();
  act(s, h, { type: 'skip' }, now);
  assert.equal(s.phase, 'reveal');
  act(s, h, { type: 'pause' }, now + 1000);
  tick(s, now + T.reveal + 5000);
  assert.equal(s.phase, 'reveal');
  act(s, h, { type: 'resume' }, now + 5000);
  assert.equal(s.until, now + T.reveal + 4000);
});
