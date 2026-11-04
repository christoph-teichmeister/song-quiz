// Pure game state machine. No I/O: server.js feeds it actions and ticks.
// Phases: lobby -> pickfront -> countdown -> playing <-> verify -> reveal -> (pickfront | end)
export const T = { countdown: 3000, reveal: 6000, idle: 180000, prompt: 15000, introMs: 5000, speedMs: 5000 };
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
    songs: [], idx: 0, locked: [], buzz: null, startedAt: 0, until: 0,
    lastActivity: now, promptUntil: 0,
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
  switch (a.type) {
    case 'team':
      if (s.phase !== 'lobby' || !['A', 'B'].includes(a.team)) return 'bad';
      p.team = a.team;
      return null;
    case 'start': {
      if (pid !== s.hostId || s.phase !== 'lobby') return 'host only';
      if (!members(s, 'A').length || !members(s, 'B').length) return 'both teams need a player';
      if (!a.songs?.length) return 'no songs';
      s.settings = { list: a.list, mode: a.mode || 'normal', length: a.length || 10 };
      s.songs = shuffle(a.songs).slice(0, s.settings.length);
      s.idx = 0;
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
      if (s.teams.A.ready && s.teams.B.ready) { s.phase = 'countdown'; s.until = now + T.countdown; }
      return null;
    }
    case 'buzz': {
      if (s.phase !== 'playing' || !p.team || s.teams[p.team].front !== pid || s.locked.includes(p.team)) return 'cannot buzz';
      s.buzz = { team: p.team, at: now - s.startedAt };
      s.phase = 'verify';
      return null;
    }
    case 'verify': { // only the opposing team may verify
      if (s.phase !== 'verify' || p.team !== other(s.buzz.team)) return 'opponent only';
      const pts = (a.title ? 1 : 0) + (a.artist ? 1 : 0);
      const fast = s.settings.mode === 'speed' && s.buzz.at < T.speedMs;
      s.teams[s.buzz.team].score += pts + (fast ? pts : 0);
      s.lastResult = { team: s.buzz.team, title: !!a.title, artist: !!a.artist, pts: pts + (fast ? pts : 0) };
      if (a.title && a.artist) return reveal(s, now);
      s.locked.push(s.buzz.team);
      s.buzz = null;
      if (s.locked.length === 2) return reveal(s, now);
      s.phase = 'playing';
      s.startedAt = now - 0; // resume; speed bonus only counts for the first answer anyway
      return null;
    }
    case 'again':
      if (pid !== s.hostId || s.phase !== 'end') return 'host only';
      s.phase = 'lobby';
      for (const t of ['A', 'B']) s.teams[t] = { score: 0, front: null, ready: false, rot: 0 };
      return null;
  }
  return 'unknown action';
}

function pickFront(s) {
  for (const t of ['A', 'B']) {
    const m = members(s, t);
    s.teams[t].front = m[s.teams[t].rot++ % m.length].id; // default rotation, teammates may override
    s.teams[t].ready = false;
  }
  s.locked = []; s.buzz = null; s.lastResult = null;
  s.phase = 'pickfront';
  return null;
}

function reveal(s, now) {
  s.phase = 'reveal'; s.until = now + T.reveal; s.buzz = null;
  return null;
}

// Time-driven transitions. Returns 'reset' when the session should be dropped.
export function tick(s, now) {
  if (s.phase === 'countdown' && now >= s.until) { s.phase = 'playing'; s.startedAt = now; }
  else if (s.phase === 'playing' && s.settings.mode === 'intro' && now - s.startedAt >= T.introMs) reveal(s, now);
  else if (s.phase === 'reveal' && now >= s.until) {
    s.idx++;
    if (s.idx >= s.songs.length) s.phase = 'end'; else pickFront(s);
  }
  if (s.promptUntil && now >= s.promptUntil) return 'reset';
  if (!s.promptUntil && now - s.lastActivity >= T.idle) s.promptUntil = now + T.prompt;
  return null;
}

// Per-viewer state: the TV gets the video id, only the verifier gets the answer.
export function view(s, pid, now) {
  const song = s.songs[s.idx];
  const me = s.players[pid];
  const showAnswer = s.phase === 'reveal' || s.phase === 'end' || (s.phase === 'verify' && me?.team === other(s.buzz.team));
  return {
    code: s.code, phase: s.phase, host: pid === s.hostId, me: me && { id: me.id, team: me.team, name: me.name },
    players: Object.values(s.players).map((p) => ({ id: p.id, name: p.name, team: p.team })),
    teams: s.teams, settings: s.settings, idx: s.idx, total: s.songs.length, locked: s.locked, buzz: s.buzz,
    lastResult: s.lastResult, until: s.until, promptUntil: s.promptUntil,
    videoId: pid === 'tv' ? song?.id : undefined,
    answer: showAnswer && song ? { title: song.title, artist: song.artist } : undefined,
  };
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
