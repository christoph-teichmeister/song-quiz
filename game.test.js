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
