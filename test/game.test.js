import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, join, act, tick, view, buildPool, inRandom, overlaySongs, ytId, T } from '../public/js/game.js';

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
  assert.equal(s.phase, 'countdown');                                     // one player per team: nothing to choose, straight to the countdown
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
  assert.equal(s.buzz, null);                              // reveal clears the buzz
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
  const s = createSession('hanna', now), b = join(s, 'ben', now).id, c = join(s, 'cy', now).id;
  act(s, s.hostId, { type: 'team', team: 'A' }, now); act(s, c, { type: 'team', team: 'A' }, now); act(s, b, { type: 'team', team: 'B' }, now);
  act(s, s.hostId, { type: 'start', list: 'x', songs, length: 1 }, now); act(s, s.hostId, { type: 'skiphowto' }, now);
  assert.equal(s.phase, 'pickfront');
  assert.equal(s.teams.B.ready, true);                                    // the one-person team is front and ready by itself
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
  const until = s.until; // reveal length depends on whether it is the last song
  act(s, h, { type: 'pause' }, now + 1000);
  tick(s, now + T.reveal + 5000);
  assert.equal(s.phase, 'reveal');
  act(s, h, { type: 'resume' }, now + 5000);
  assert.equal(s.until, until + 4000);
});

test('after the last song the final screen comes sooner', () => {
  const { s, h, now } = setup();
  s.idx = s.songs.length - 1; // last song
  act(s, h, { type: 'skip' }, now);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.until, now + T.revealLast);
  tick(s, now + T.revealLast);
  assert.equal(s.phase, 'end');
});

// ---- PR 2: game flow ----
function room(n, opts = {}, len = 2) { // n players per team (A first), started and confirmed; returns ids per team
  const now = 0, s = createSession('a1', now), ids = { A: [s.hostId], B: [] };
  act(s, s.hostId, { type: 'team', team: 'A' }, now);
  for (let i = 1; i < n; i++) { const id = join(s, 'a' + (i + 1), now).id; ids.A.push(id); act(s, id, { type: 'team', team: 'A' }, now); }
  for (let i = 0; i < n; i++) { const id = join(s, 'b' + (i + 1), now).id; ids.B.push(id); act(s, id, { type: 'team', team: 'B' }, now); }
  assert.equal(act(s, s.hostId, { type: 'start', list: 'x', songs: [...songs, { id: 'c', title: 'T3', artist: 'A3' }], length: len, ...opts }, now), null);
  act(s, s.hostId, { type: 'skiphowto' }, now);
  return { s, ids };
}
const play = (s, now) => { now += T.countdown; tick(s, now); return now; };

test('new settings are validated and default to front buzzers, auto-skip after 45 s', () => {
  assert.deepEqual([room(1).s.settings.buzzers, room(1).s.settings.autoskip], ['front', 45]);
  const { s } = room(1, { buzzers: 'all', autoskip: 0 });
  assert.deepEqual([s.settings.buzzers, s.settings.autoskip], ['all', 0]);
  const x = room(1, { buzzers: 'nope', autoskip: 99 }).s;
  assert.deepEqual([x.settings.buzzers, x.settings.autoskip], ['front', 45]);
  assert.equal(view(s, s.hostId, 0).settings.buzzers, 'all');
});

test('pickfront: a one-person team is front by itself, the other team still chooses; 1 vs 1 skips it', () => {
  let now = 0;
  const s = createSession('a1', now), b = join(s, 'b1', now).id, c = join(s, 'b2', now).id;
  act(s, s.hostId, { type: 'team', team: 'A' }, now); act(s, b, { type: 'team', team: 'B' }, now); act(s, c, { type: 'team', team: 'B' }, now);
  act(s, s.hostId, { type: 'start', list: 'x', songs, length: 1 }, now); act(s, s.hostId, { type: 'skiphowto' }, now);
  assert.equal(s.phase, 'pickfront');
  assert.equal(s.teams.A.front, s.hostId); assert.equal(s.teams.A.ready, true);
  assert.equal(act(s, s.hostId, { type: 'front', id: s.hostId }, now), 'bad');   // nothing to choose
  act(s, b, { type: 'ready' }, now);
  assert.equal(s.phase, 'countdown');
  assert.equal(room(1).s.phase, 'countdown');
});

test("buzzers 'all': no pickfront, every team member buzzes, the judge is from the other team", () => {
  const { s, ids } = room(2, { buzzers: 'all' });
  assert.equal(s.phase, 'countdown'); assert.equal(s.judge, null);
  let now = play(s, 0);
  assert.equal(s.phase, 'playing');
  assert.equal(act(s, ids.A[1], { type: 'buzz' }, now), null);                  // not a "front-person": still fine
  assert.ok(ids.B.includes(s.judge));
  assert.equal(act(s, ids.A[0], { type: 'verify', title: true }, now), 'judge only');
  assert.ok(view(s, s.judge, now).answer); assert.equal(view(s, ids.B.find((i) => i !== s.judge), now).answer, undefined);
  act(s, s.judge, { type: 'verify', title: false, artist: false }, now);          // wrong: only A is locked, B may buzz
  assert.deepEqual(s.locked, ['A']);
  assert.equal(act(s, ids.A[0], { type: 'buzz' }, now), 'cannot buzz');
  assert.equal(act(s, ids.B[1], { type: 'buzz' }, now), null);
  assert.ok(ids.A.includes(s.judge));
  act(s, s.judge, { type: 'verify', title: true, artist: true }, now);
  assert.equal(s.phase, 'reveal'); assert.equal(s.teams.B.score, 2);
  tick(s, now + T.reveal);                                                         // next song: countdown, again no judge and no front
  assert.equal(s.phase, 'countdown'); assert.equal(s.judge, null);
});

test("buzzers 'all' with one player in the other team: that player judges and both teams are locked after a wrong answer", () => {
  let now = 0;
  const s = createSession('a1', now), a2 = join(s, 'a2', now).id, b = join(s, 'b1', now).id;
  for (const [id, t] of [[s.hostId, 'A'], [a2, 'A'], [b, 'B']]) act(s, id, { type: 'team', team: t }, now);
  act(s, s.hostId, { type: 'start', list: 'x', songs, length: 1, buzzers: 'all' }, now); act(s, s.hostId, { type: 'skiphowto' }, now);
  now = play(s, now);
  act(s, a2, { type: 'buzz' }, now);
  assert.equal(s.judge, null);
  assert.equal(act(s, b, { type: 'verify', title: false }, now), null);
  assert.equal(s.phase, 'reveal');
});

test('front buzzers: only the front-person buzzes (as before)', () => {
  const { s, ids } = room(2);
  const now = play(s, 0), other = ids.A.find((i) => i !== s.teams.A.front);
  assert.equal(act(s, other, { type: 'buzz' }, now), 'cannot buzz');
});

// undo
function judgeRoom() { const r = room(3, {}, 3); for (const t of ['A', 'B']) act(r.s, r.s.teams[t].front, { type: 'ready' }, 0); assert.ok(r.s.judge); return { ...r, now: play(r.s, 0) }; }
const buzzFront = (s, t, now) => act(s, s.teams[t].front, { type: 'buzz' }, now);

test('undo after a point: score back, same buzz in verify with a fresh answer window', () => {
  const { s, now } = judgeRoom(), j = s.judge;
  buzzFront(s, 'A', now);
  act(s, j, { type: 'verify', title: true, artist: false }, now + 1000);
  assert.equal(s.teams.A.score, 1); assert.equal(s.phase, 'playing');
  assert.equal(view(s, j, now).canUndo, true); assert.equal(view(s, s.hostId, now).canUndo, s.hostId === j);
  assert.equal(act(s, s.teams.A.front, { type: 'undo' }, now + 2000), 'not now');
  assert.equal(act(s, j, { type: 'undo' }, now + 5000), null);
  assert.equal(s.phase, 'verify'); assert.equal(s.teams.A.score, 0); assert.deepEqual(s.got, { title: null, artist: null });
  assert.equal(s.lastResult, null); assert.deepEqual(s.stats, {}); assert.equal(s.buzz.team, 'A'); assert.equal(s.buzz.until, now + 5000 + T.answer);
  assert.equal(act(s, j, { type: 'undo' }, now), 'not now');                       // only once
  act(s, j, { type: 'verify', title: true, artist: true }, now + 6000);              // the right ruling this time
  assert.equal(s.teams.A.score, 2); assert.equal(s.phase, 'reveal');
});

test('undo after a wrong answer: the lock is removed', () => {
  const { s, now } = judgeRoom(), j = s.judge;
  buzzFront(s, 'A', now);
  act(s, j, { type: 'verify', title: false, artist: false }, now);
  assert.deepEqual(s.locked, ['A']); assert.equal(s.stats[s.teams.A.front].wrong, 1);
  act(s, j, { type: 'undo' }, now);
  assert.deepEqual(s.locked, []); assert.equal(s.stats[s.teams.A.front], undefined); assert.equal(s.phase, 'verify');
  act(s, j, { type: 'misfire' }, now);
  assert.equal(act(s, j, { type: 'undo' }, now), 'not now');
});

test('undo is closed once someone buzzes again; a later ruling can be undone instead', () => {
  const { s, now } = judgeRoom(), j = s.judge;
  buzzFront(s, 'A', now); act(s, j, { type: 'verify', title: false, artist: false }, now);
  buzzFront(s, 'B', now);
  assert.equal(act(s, j, { type: 'undo' }, now), 'not now');
  act(s, j, { type: 'verify', title: true, artist: false }, now);
  assert.equal(s.teams.B.score, 1);
  act(s, j, { type: 'undo' }, now);
  assert.equal(s.teams.B.score, 0); assert.deepEqual(s.locked, ['A']); assert.equal(s.buzz.team, 'B');
});

test('undo after the final ruling that caused the reveal: back to verify, timeline and next plan reverted', () => {
  const { s, now } = judgeRoom(), j = s.judge;
  buzzFront(s, 'A', now);
  act(s, j, { type: 'verify', title: true, artist: true }, now);
  assert.equal(s.phase, 'reveal'); assert.equal(s.timeline.length, 2); assert.ok(s.next);
  assert.equal(act(s, j, { type: 'undo' }, now + 1000), null);
  assert.equal(s.phase, 'verify'); assert.equal(s.timeline.length, 1); assert.equal(s.next, null); assert.equal(s.teams.A.score, 0);
  assert.equal(view(s, j, now).answer.title.length > 0, true);
  tick(s, now + T.reveal + 1);                                                    // no stray reveal timer moves the game on
  assert.equal(s.phase, 'verify');
});

test('undo is refused after the next countdown started and while paused', () => {
  const { s, now } = judgeRoom(), j = s.judge;
  buzzFront(s, 'A', now); act(s, j, { type: 'verify', title: true, artist: true }, now);
  act(s, s.hostId, { type: 'pause' }, now);
  assert.equal(act(s, j, { type: 'undo' }, now), 'paused');
  act(s, s.hostId, { type: 'resume' }, now + 500);
  tick(s, now + 500 + T.reveal);
  assert.equal(s.phase, 'countdown');
  assert.equal(act(s, j, { type: 'undo' }, now + 500 + T.reveal), 'not now');
});

// auto-skip
test('auto-skip: after the set time without a buzz a 10 s warning runs, then the song is revealed', () => {
  const { s, ids } = room(1, { autoskip: 30 });
  let now = play(s, 0);
  tick(s, now + 29000); assert.equal(s.skipAt, 0);
  tick(s, now + 30000); assert.equal(s.skipAt, now + 30000 + T.skipWarn); assert.equal(s.phase, 'playing');
  assert.equal(view(s, ids.A[0], now).skipAt, s.skipAt);
  tick(s, now + 39999); assert.equal(s.phase, 'playing');
  tick(s, now + 40000); assert.equal(s.phase, 'reveal'); assert.equal(s.skipAt, 0); assert.equal(s.lastResult, null);
});

test('auto-skip: a buzz during the warning cancels it, and it is off with 0', () => {
  const { s, ids } = room(1, { autoskip: 30 });
  let now = play(s, 0);
  tick(s, now + 32000); assert.ok(s.skipAt);
  act(s, ids.A[0], { type: 'buzz' }, now + 33000);
  assert.equal(s.skipAt, 0);
  act(s, ids.B[0], { type: 'misfire' }, now + 34000);
  assert.equal(s.skipAt, 0); tick(s, now + 34000 + 29000); assert.equal(s.skipAt, 0);                // counts again from the resume
  tick(s, now + 34000 + 30000); assert.ok(s.skipAt);
  const off = room(1, { autoskip: 0 }).s; now = play(off, 0);
  tick(s, now); tick(off, now + 600000); assert.equal(off.phase, 'playing');
});

test('auto-skip: the warning and the clock shift by the paused time', () => {
  const { s } = room(1, { autoskip: 30 });
  const now = play(s, 0);
  tick(s, now + 31000); const at = s.skipAt;
  act(s, s.hostId, { type: 'pause' }, now + 32000);
  tick(s, now + 100000); assert.equal(s.phase, 'playing');
  act(s, s.hostId, { type: 'resume' }, now + 62000);
  assert.equal(s.skipAt, at + 30000);
  tick(s, now + 62000 + 8999); assert.equal(s.phase, 'playing');                    // 9 s of the warning are left at the pause
  tick(s, now + 62000 + 9000); assert.equal(s.phase, 'reveal');
});

// pool: no repeats, random by category
const L = (id, n) => Array.from({ length: n }, (_, i) => ({ id: id + i, title: id + i, artist: 'x' }));
const lists = { a: L('a', 10), b: L('b', 4), c: L('c', 4), 'tv-now': L('tv', 20), 'ambient-sound-system': L('amb', 5) };

const CAT = [{ id: 'tv-now', special: true }, { id: 'ambient-sound-system', random: false }];

test('pool: played songs stay out, memory resets when too few are left, each song carries its category', () => {
  const played = new Set(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  let r = buildPool(lists, 'a', played, 3);
  assert.equal(r.reset, false); assert.deepEqual(r.songs.map((x) => x.id).sort(), ['a7', 'a8', 'a9']); assert.ok(r.songs.every((x) => x.cat === 'a'));
  r = buildPool(lists, 'a', played, 4);
  assert.equal(r.reset, true); assert.equal(r.songs.length, 4);
  r = buildPool(lists, 'b', new Set(['b0']), 10);                                  // a game longer than the list: needs all 4, only 3 are fresh, so reset
  assert.equal(r.songs.length, 4); assert.equal(r.reset, true);
  assert.equal(buildPool(lists, 'a', new Set(), 10).songs.length, 10);
});

test('random: special lists stay out, categories are drawn uniformly first, played songs excluded', () => {
  assert.ok(!inRandom({ id: 'tv-now', special: true }) && !inRandom({ id: 'ambient', random: false }) && inRandom({ id: 'a' }));
  const hits = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 600; i++) {
    const r = buildPool(lists, 'random', new Set(), 1, CAT).songs[0];
    assert.ok(r.cat in hits); hits[r.cat]++;
  }
  for (const k in hits) assert.ok(hits[k] > 140, k + ' ' + hits[k]);               // flat mixing would give a 10/18 share to "a"
  const r = buildPool(lists, 'random', new Set(['a0', 'b0']), 12, CAT);
  assert.equal(r.songs.length, 12); assert.ok(!r.songs.some((x) => ['a0', 'b0'].includes(x.id))); assert.equal(new Set(r.songs.map((x) => x.id)).size, 12);
  assert.equal(buildPool(lists, 'random', new Set(), 50, CAT).songs.length, 18);
  assert.equal(buildPool(lists, 'random', new Set(), 5, CAT).reset, false);
});

test('the reveal answer carries the song category', () => {
  const { s, ids } = room(1, {}, 1); s.songs[0].cat = 'hits-80s';
  const now = play(s, 0); act(s, s.teams.A.front, { type: 'skip' }, now);
  assert.equal(view(s, ids.A[0], now).answer.cat, 'hits-80s');
});

test('host picks are stored for the other phones and used at start', () => {
  const s = createSession('host', 0), h = s.hostId, b = join(s, 'bob', 0).id;
  act(s, h, { type: 'team', team: 'A' }, 0); act(s, b, { type: 'team', team: 'B' }, 0);
  assert.equal(view(s, b, 0).cfg, null);
  assert.equal(view(s, b, 0).hostName, 'host');
  assert.equal(act(s, b, { type: 'cfg', list: 'x' }, 0), 'host only');
  assert.equal(act(s, h, { type: 'cfg', list: 'x', mode: 'speed', length: 7, buzzers: 'all', autoskip: 30, scroll: 0.4 }, 0), null);
  assert.deepEqual(view(s, b, 0).cfg, { list: 'x', mode: 'speed', length: 7, buzzers: 'all', autoskip: 30, scroll: 0.4 });
  assert.equal(act(s, h, { type: 'cfg', mode: 'bogus', length: 999, buzzers: 'x', autoskip: 5 }, 0), null);
  assert.deepEqual(view(s, b, 0).cfg, { list: null, mode: 'normal', length: 50, buzzers: 'front', autoskip: 45, scroll: 0 });
  act(s, h, { type: 'cfg', list: 'x', mode: 'speed', length: 1, buzzers: 'all', autoskip: 0 }, 0);
  assert.equal(act(s, h, { type: 'start', list: 'other', mode: 'normal', length: 2, songs }, 0), null); // the stored picks win
  assert.deepEqual(s.settings, { list: 'x', special: false, mode: 'speed', length: 1, buzzers: 'all', autoskip: 0 });
  assert.equal(act(s, h, { type: 'cfg', list: 'y' }, 0), 'host only'); // lobby only
});

test('special list: the judge only says right or wrong, one point, title and artist are won together', () => {
  const sp = [{ id: 's1', title: 'Show', artist: '', special: true }, { id: 's2', title: 'Film', artist: '', special: true }];
  assert.ok(buildPool(lists, 'tv-now', new Set(), 3, CAT).songs.every((x) => x.special));
  assert.ok(!buildPool(lists, 'a', new Set(), 3, CAT).songs.some((x) => x.special));
  const { s } = room(1, { songs: sp }, 2); assert.equal(s.settings.special, true);
  let now = play(s, 0); buzzFront(s, 'A', now);
  assert.equal(act(s, s.hostId === s.teams.B.front ? s.hostId : s.teams.B.front, { type: 'verify', title: true, artist: true }, now), null);
  assert.deepEqual([s.teams.A.score, s.got.title, s.got.artist, s.phase], [1, 'A', 'A', 'reveal']);
  assert.deepEqual(s.lastResult, { team: 'A', title: true, artist: true, pts: 1 });
  assert.equal(view(s, 'tv', now).answer.artist, '');
});

test('special list in speed mode: a fast right answer gives 2 points, wrong gives none', () => {
  const sp = [{ id: 's1', title: 'Show', artist: '', special: true }, { id: 's2', title: 'Film', artist: '', special: true }];
  for (const [ok, pts] of [[true, 2], [false, 0]]) {
    const { s } = room(1, { songs: sp, mode: 'speed' }, 2);
    const now = play(s, 0); buzzFront(s, 'B', now + 1000);
    act(s, s.teams.A.front, { type: 'verify', title: ok, artist: ok }, now + 1000);
    assert.equal(s.teams.B.score, pts);
  }
});

test('normal lists keep two points for title and artist', () => {
  const { s } = room(1); let now = play(s, 0); buzzFront(s, 'A', now);
  act(s, s.teams.B.front, { type: 'verify', title: true, artist: true }, now);
  assert.equal(s.settings.special, false); assert.equal(s.teams.A.score, 2);
});

test('overlaySongs: DB lists replace, add and delete static ones; junk is ignored', () => {
  const cat = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], lists = { a: [{ id: 'x' }], b: [{ id: 'y' }] };
  const r = overlaySongs(cat, lists, { a: { name: 'A2' }, b: { deleted: true }, c: { name: 'C' }, d: 5 }, { a: [{ id: 'z', title: 'Z' }, null], c: { 0: { id: 'q' } } });
  assert.deepEqual(r.catalog.map((c) => c.name), ['A2', 'C']);
  assert.deepEqual(r.lists, { a: [{ id: 'z', title: 'Z' }], c: [{ id: 'q' }] });
  assert.deepEqual(overlaySongs(cat, lists, null, 'x'), { catalog: cat, lists });
  assert.equal(cat.length, 2);
});

test('ytId takes ids and common URL shapes', () => {
  const id = 'dQw4w9WgXcQ';
  for (const s of [id, ` ${id} `, `https://www.youtube.com/watch?v=${id}&t=5`, `https://youtu.be/${id}?si=x`, `https://www.youtube.com/embed/${id}`, `https://music.youtube.com/watch?list=L&v=${id}`]) assert.equal(ytId(s), id, s);
  for (const s of ['', 'abc', 'https://example.com/x', `${id}x`]) assert.equal(ytId(s), null, s);
});
