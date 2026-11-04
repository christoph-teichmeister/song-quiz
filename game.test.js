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

test('wrong answer locks team, other team can buzz, then reveal', () => {
  const { s, h, b, now } = setup();
  act(s, h, { type: 'buzz' }, now);
  assert.equal(s.phase, 'verify');
  assert.equal(view(s, h, now).answer, undefined);        // buzzer must not see the answer
  assert.ok(view(s, b, now).answer);                       // verifier does
  assert.equal(act(s, h, { type: 'verify', title: true }, now), 'opponent only');
  act(s, b, { type: 'verify', title: false, artist: false }, now);
  assert.equal(s.phase, 'playing');
  assert.equal(act(s, h, { type: 'buzz' }, now), 'cannot buzz'); // locked
  act(s, b, { type: 'buzz' }, now);
  act(s, h, { type: 'verify', title: true, artist: true }, now);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.teams.B.score, 2);
  tick(s, now + T.reveal);
  assert.equal(s.phase, 'end');
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
