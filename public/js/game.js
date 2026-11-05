// Pure game state machine. No I/O: server.js feeds it actions and ticks.
// Phases: lobby -> howto -> pickfront (first song only) -> countdown -> playing <-> verify -> reveal -> (countdown | end)
export const T = { countdown: 3000, reveal: 10000, revealLast: 4000, idle: 180000, prompt: 15000, introMs: 5000, speedMs: 5000, answer: 10000 }; // answer: time to speak after a buzz (a bar on the screens); the judge has no time limit and may talk it over
const IDLE_PHASES = ['lobby', 'howto', 'pickfront', 'end']; // the idle reset never fires while a song is running
const other = (t) => (t === 'A' ? 'B' : 'A');
const uid = () => Math.random().toString(36).slice(2, 10);

export function createSession(hostName, now, hostId) {
  const host = player(hostName, hostId);
  return {
    code: String(Math.floor(1000 + Math.random() * 9000)),
    hostId: host.id,
    phase: 'lobby',
    players: { [host.id]: host },
    teams: { A: { score: 0, front: null, ready: false, rot: 0 }, B: { score: 0, front: null, ready: false, rot: 0 } },
    settings: { list: null, mode: 'normal', length: 10 },
    songs: [], idx: 0, locked: [], buzz: null, startedAt: 0, playMs: 0, got: { title: null, artist: null }, until: 0, // playMs: song time before the current stretch (a wrong answer pauses the song)
    lastActivity: now, promptUntil: 0, paused: null, // paused: { at } while the host has stopped the clock
    gameNo: 0, ack: {}, stats: {}, timeline: [{ A: 0, B: 0 }], // per-player buzz stats and the score after every song
  };
}

function player(name, id) {
  return { id: id || uid(), name: String(name).slice(0, 20) || 'Player', team: null, connected: true };
}

export function join(s, name, now, id) {
  const p = player(name, id);
  s.players[p.id] = p;
  touch(s, now);
  return p;
}

const members = (s, team) => Object.values(s.players).filter((p) => p.team === team);
const touch = (s, now) => { s.lastActivity = now; s.promptUntil = 0; };

// Every action returns an error string or null.
export function act(s, pid, a, now) {
  const p = s.players[pid];
  if (!p) return 'unknown player';
  touch(s, now);
  if (s.paused && a.type !== 'resume') return 'paused';
  switch (a.type) {
    case 'team':
      if (s.phase !== 'lobby' || !['A', 'B'].includes(a.team)) return 'bad';
      p.team = a.team;
      return null;
    case 'start': {
      if (pid !== s.hostId || s.phase !== 'lobby') return 'host only';
      if (!members(s, 'A').length || !members(s, 'B').length) return 'both teams need a player';
      if (!a.songs?.length) return 'no songs';
      s.settings = { list: a.list, mode: a.mode || 'normal', length: Math.max(1, Math.min(50, Math.floor(+a.length) || 10)) }; // 1 to 50 songs
      s.songs = shuffle(a.songs).slice(0, s.settings.length);
      s.idx = 0; s.gameNo++; s.stats = {}; s.timeline = [{ A: 0, B: 0 }];
      s.phase = 'howto'; s.ack = {}; // everyone with a team confirms the rules first
      return null;
    }
    case 'ack': {
      if (s.phase !== 'howto' || !p.team) return 'not now';
      s.ack[pid] = true;
      if (Object.values(s.players).filter((q) => q.team).every((q) => s.ack[q.id])) return pickFront(s);
      return null;
    }
    case 'skiphowto': {
      if (pid !== s.hostId || s.phase !== 'howto') return 'host only';
      return pickFront(s);
    }
    case 'front': { // teammate sets the front-person of own team
      if (s.phase !== 'pickfront' || !p.team) return 'bad';
      const t = members(s, p.team).find((m) => m.id === a.id);
      if (!t) return 'bad';
      s.teams[p.team].front = t.id;
      s.teams[p.team].ready = false;
      return null;
    }
    case 'ready': {
      if (s.phase !== 'pickfront' || !p.team || s.teams[p.team].front !== pid) return 'front only';
      s.teams[p.team].ready = true;
      if (s.teams.A.ready && s.teams.B.ready) startCountdown(s, now);
      return null;
    }
    case 'buzz': {
      if (s.phase !== 'playing' || !p.team || s.teams[p.team].front !== pid || s.locked.includes(p.team)) return 'cannot buzz';
      s.buzz = { team: p.team, at: s.playMs + now - s.startedAt, pid, until: now + T.answer }; // at = song time in ms, until = end of speaking time
      s.phase = 'verify';
      return null;
    }
    case 'verify': { // the judge sees the answer; without a spare player the opposing team judges and is locked out afterwards
      if (s.phase !== 'verify') return 'not now';
      if (s.judge ? pid !== s.judge : p.team !== other(s.buzz.team)) return 'judge only';
      return judged(s, now, !!a.title, !!a.artist);
    }
    case 'misfire': // the buzz was a slip: back to the song, nobody is locked, nothing counts
      if (s.phase !== 'verify') return 'not now';
      if (s.judge ? pid !== s.judge : p.team !== other(s.buzz.team)) return 'judge only';
      return resume(s, now);
    case 'skip': // host moves on when something is stuck (dead phone, broken video, nobody knows the song)
      if (pid !== s.hostId) return 'host only';
      if (s.phase === 'pickfront') return startCountdown(s, now);
      if (!['countdown', 'playing', 'verify'].includes(s.phase)) return 'not now';
      return reveal(s, now);
    case 'pause':
      if (pid !== s.hostId) return 'host only';
      if (!['countdown', 'playing', 'verify', 'reveal'].includes(s.phase)) return 'not now';
      s.paused = { at: now };
      return null;
    case 'resume': { // every running timer moves by the time spent paused
      if (pid !== s.hostId) return 'host only';
      if (!s.paused) return 'not now';
      const d = now - s.paused.at;
      s.until += d; s.startedAt += d; if (s.buzz) s.buzz.until += d;
      s.paused = null;
      return null;
    }
    case 'again':
      if (pid !== s.hostId || s.phase !== 'end') return 'host only';
      s.phase = 'lobby';
      for (const t of ['A', 'B']) s.teams[t] = { score: 0, front: null, ready: false, rot: 0 };
      s.stats = {}; s.timeline = [{ A: 0, B: 0 }];
      return null;
  }
  return 'unknown action';
}

// A random player who is not a front-person judges this song (sees the answer), so neither team learns it by verifying.
function pickJudge(s) {
  const fronts = [s.teams.A.front, s.teams.B.front];
  const c = Object.values(s.players).filter((p) => p.team && !fronts.includes(p.id));
  return choose(s, c);
}

// Random pick, but not the previous judge twice in a row (when there is a choice).
function choose(s, c) {
  const f = c.filter((p) => p.id !== s.judge), l = f.length ? f : c;
  return l.length ? l[Math.floor(Math.random() * l.length)].id : null;
}

function startCountdown(s, now) {
  s.teams.A.ready = s.teams.B.ready = true;
  s.phase = 'countdown'; s.until = now + T.countdown; s.judge = pickJudge(s); s.got = { title: null, artist: null };
  return null;
}

function resume(s, now) { s.playMs = s.buzz.at; s.buzz = null; s.phase = 'playing'; s.startedAt = now; return null; }

// The judge rules on a buzz. Title and artist score once per song, so the other team can only win what is still open.
function judged(s, now, title, artist) {
  const b = s.buzz, g = s.got, nt = title && !g.title, na = artist && !g.artist, pts = (nt ? 1 : 0) + (na ? 1 : 0);
  const fast = s.settings.mode === 'speed' && b.at < T.speedMs;
  const gain = pts + (fast ? pts : 0);
  if (nt) g.title = b.team;
  if (na) g.artist = b.team;
  s.teams[b.team].score += gain;
  s.lastResult = { team: b.team, title: !!nt, artist: !!na, pts: gain };
  const st = (s.stats[b.pid] ||= { buzzes: 0, right: 0, wrong: 0, pts: 0, times: [] }); // who buzzed, how fast, right or wrong
  st.buzzes++; st.times.push(b.at); st.pts += gain; if (pts) st.right++; else st.wrong++;
  if (g.title && g.artist) return reveal(s, now);
  for (const t of s.judge ? [b.team] : ['A', 'B']) if (!s.locked.includes(t)) s.locked.push(t);
  if (s.locked.length === 2) return reveal(s, now);
  return resume(s, now);
}

function pickFront(s) {
  for (const t of ['A', 'B']) {
    const m = members(s, t);
    s.teams[t].front = m[s.teams[t].rot++ % m.length].id; // default rotation, teammates may override
    s.teams[t].ready = false;
  }
  s.locked = []; s.buzz = null; s.lastResult = null; s.judge = null; s.playMs = 0; s.got = { title: null, artist: null };
  s.phase = 'pickfront';
  return null;
}

function reveal(s, now) {
  s.phase = 'reveal'; s.until = now + (s.idx + 1 >= s.songs.length ? T.revealLast : T.reveal); // after the last song the final screen comes sooner s.buzz = null;
  s.timeline.push({ A: s.teams.A.score, B: s.teams.B.score });
  s.next = s.idx + 1 < s.songs.length ? planNext(s) : null; // decided now so the phones can announce who is up
  return null;
}

// Next song: the next player in each team's rotation buzzes, a random other player judges.
function planNext(s) {
  const front = {};
  for (const t of ['A', 'B']) { const m = members(s, t); front[t] = m[s.teams[t].rot % m.length].id; }
  const c = Object.values(s.players).filter((p) => p.team && p.id !== front.A && p.id !== front.B);
  return { A: front.A, B: front.B, judge: choose(s, c) };
}

// Time-driven transitions. Returns 'reset' when the session should be dropped.
export function tick(s, now) {
  if (s.paused) return null; // nothing moves, not even the idle prompt
  if (s.phase === 'countdown' && now >= s.until) { s.phase = 'playing'; s.startedAt = now; s.playMs = 0; }
  else if (s.phase === 'playing' && s.settings.mode === 'intro' && s.playMs + now - s.startedAt >= T.introMs) reveal(s, now);
  else if (s.phase === 'reveal' && now >= s.until) {
    s.idx++;
    if (s.idx >= s.songs.length) s.phase = 'end';
    else { // next song right away with the planned front-persons and judge
      const n = s.next || planNext(s);
      for (const t of ['A', 'B']) { s.teams[t].front = n[t]; s.teams[t].rot++; s.teams[t].ready = true; }
      s.locked = []; s.buzz = null; s.lastResult = null; s.judge = n.judge; s.next = null; s.playMs = 0; s.got = { title: null, artist: null };
      s.phase = 'countdown'; s.until = now + T.countdown;
    }
  }
  if (!IDLE_PHASES.includes(s.phase)) { s.promptUntil = 0; return null; }
  if (s.promptUntil && now >= s.promptUntil) return 'reset';
  if (!s.promptUntil && now - s.lastActivity >= T.idle) s.promptUntil = now + T.prompt;
  return null;
}

// Per-viewer state: the TV gets the video id, only the verifier gets the answer.
export function view(s, pid, now) {
  const song = s.songs[s.idx];
  const me = s.players[pid];
  const showAnswer = s.phase === 'reveal' || s.phase === 'end' || (s.phase === 'verify' && (s.judge ? pid === s.judge : me?.team === other(s.buzz.team)));
  return {
    code: s.code, phase: s.phase, host: pid === s.hostId, me: me && { id: me.id, team: me.team, name: me.name },
    players: Object.values(s.players).map((p) => ({ id: p.id, name: p.name, team: p.team })),
    next: s.next ? { A: s.next.A, B: s.next.B, judge: s.next.judge, names: { A: s.players[s.next.A]?.name, B: s.players[s.next.B]?.name, judge: s.players[s.next.judge]?.name } } : null,
    ack: s.phase === 'howto' ? Object.keys(s.ack || {}) : null, game: s.gameNo, stats: s.phase === 'end' ? playerStats(s) : null, timeline: s.phase === 'end' ? s.timeline : null,
    judge: s.judge, judgeName: s.judge ? s.players[s.judge]?.name : null,
    teams: s.teams, settings: s.settings, idx: s.idx, total: s.songs.length, locked: s.locked, buzz: s.buzz,
    lastResult: s.lastResult, judged: Object.values(s.stats).reduce((a, p) => a + p.buzzes, 0), // judged: answers so far (the TV plays a sound for each)
    got: s.got, until: s.until, promptUntil: s.promptUntil, paused: !!s.paused,
    videoId: pid === 'tv' ? song?.id : undefined,
    answer: showAnswer && song ? { title: song.title, artist: song.artist } : undefined,
  };
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// End-of-game numbers per player (everyone with a team, including players who never buzzed).
function playerStats(s) {
  return Object.values(s.players).filter((p) => p.team).map((p) => {
    const st = s.stats[p.id] || { buzzes: 0, right: 0, wrong: 0, pts: 0, times: [] };
    return { id: p.id, name: p.name, team: p.team, buzzes: st.buzzes, right: st.right, wrong: st.wrong, pts: st.pts,
      avgMs: st.times.length ? Math.round(st.times.reduce((a, b) => a + b, 0) / st.times.length) : null,
      bestMs: st.times.length ? Math.min(...st.times) : null };
  });
}

// Awards from playerStats(): {playerId: ['pts' | 'fast' | 'sharp', ...]} (the pages translate the codes)
export function awards(stats) {
  const out = {}, add = (ids, code) => ids.forEach((id) => (out[id] ||= []).push(code));
  const top = (list, key, better) => { const v = list.map(key); const m = better(...v); return list.filter((p) => key(p) === m).map((p) => p.id); };
  const scored = stats.filter((p) => p.pts > 0);
  if (scored.length) add(top(scored, (p) => p.pts, Math.max), 'pts');
  const timed = stats.filter((p) => p.avgMs != null);
  if (timed.length) add(top(timed, (p) => p.avgMs, Math.min), 'fast');
  const sharp = stats.filter((p) => p.buzzes >= 2 && p.right > 0);
  if (sharp.length) add(top(sharp, (p) => Math.round(100 * p.right / p.buzzes), Math.max), 'sharp');
  return out;
}
