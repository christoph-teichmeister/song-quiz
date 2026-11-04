// End-to-end scenarios: the real pages talk to each other through the fake database. Run: npm run e2e
import test from 'node:test';
import assert from 'node:assert/strict';
import { serve, launch, newWorld, text, until, has, waitText } from './harness.js';

let srv, browser;
test.before(async () => { srv = await serve(); browser = await launch(); });
test.after(async () => { await browser?.close(); srv?.close(); });

const NAMES = ['Anna', 'Cleo', 'Ben', 'Dan'], TEAM = { Anna: 'A', Cleo: 'A', Ben: 'B', Dan: 'B' };
const btn = (p, name) => p.getByRole('button', { name });

// TV + four phones in the lobby, teams picked, game started (mode and length as given), rules confirmed
async function startGame(world, { mode, length = 3, names = NAMES, howto = true } = {}) {
  const tv = await world.open('/?new&fast');
  await tv.click('#snd');
  const ph = {};
  ph.Anna = await world.open('/play?p=Anna');
  await btn(ph.Anna, 'Neues Spiel starten').click();
  await waitText(tv, /Tritt mit dem Code/);
  for (const n of names.slice(1)) { ph[n] = await world.open('/play?p=' + n); await btn(ph[n], 'Spiel beitreten').click(); }
  for (const n of names) await ph[n].locator(`.team-card.${TEAM[n]}`).click();
  await waitText(ph.Anna, /Jedes Team braucht|Spiel starten/);
  if (mode === 'intro') { await btn(ph.Anna, 'Nur Intro').click(); await btn(ph.Anna, 'OK').click(); }
  await btn(ph.Anna, 'Eigene').click();
  await ph.Anna.fill('#len', String(length));
  await btn(ph.Anna, 'Spiel starten').click();
  if (howto) {
    await waitText(tv, /Spielregeln/);
    for (const n of names) await btn(ph[n], 'Verstanden').click();
  }
  return { tv, ph };
}

// first song: the two front-persons tap Ready
async function ready(ph) {
  await until(async () => (await Promise.all(Object.values(ph).map((p) => btn(p, 'Bereit').count()))).reduce((a, b) => a + b) === 2, 'two ready buttons');
  for (const p of Object.values(ph)) if (await btn(p, 'Bereit').count()) await btn(p, 'Bereit').click();
}

const teamOf = (p) => p.evaluate(() => document.querySelector('.hdr span b.A, .hdr span b.B')?.className ?? null);
// wait for the song to play: returns the buzzers by team and the judge
async function playing(ph) {
  await until(async () => (await Promise.all(Object.values(ph).map((p) => p.locator('.buzz').count()))).some(Boolean), 'a buzzer');
  const fronts = {}; let judge = null;
  for (const [n, p] of Object.entries(ph)) {
    if (await p.locator('.buzz').count()) fronts[await teamOf(p)] = n;
    if (await has(p, /Du bist Schiri bei diesem Song/)) judge = n;
  }
  return { fronts, judge };
}
const RIGHT = { both: '✓ Titel und Interpret richtig', title: 'Nur Titel richtig', artist: 'Interpret richtig', wrong: '✗ Falsch' };
async function buzzAndJudge(ph, fronts, judge, team, result, label = RIGHT[result]) {
  await ph[fronts[team]].locator('.buzz').click();
  await until(() => btn(ph[judge], RIGHT.wrong).count(), 'judge screen');
  await btn(ph[judge], label).click();
}

test('a full game: roles, secrecy, wrong answer, partial points, end screen', async () => {
  const world = await newWorld(browser, srv.url);
  const { tv, ph } = await startGame(world);
  await ready(ph);

  // song 1: team A buzzes, judge says both right. Only the judge sees the answer.
  let r = await playing(ph);
  assert.match(await text(tv), /Song 1 von 3/, 'TV shows the song cover while playing');
  assert.ok(r.judge && !Object.values(r.fronts).includes(r.judge), 'judge is not a front-person');
  await ph[r.fronts.A].locator('.buzz').click();
  await until(() => ph[r.judge].locator('.answer').count(), 'judge sees answer');
  assert.match(await text(tv), /Team A\s+hat gebuzzert/, 'TV shows who buzzed');
  const answer = (await ph[r.judge].locator('.answer').innerText()).split('\n')[0];
  for (const n of NAMES) if (n !== r.judge) assert.equal(await ph[n].locator('.answer').count(), 0, n + ' must not see the answer');
  assert.ok(!(await text(tv)).includes(answer), 'TV must not show the answer during verify');
  await btn(ph[r.judge], RIGHT.both).click();
  await waitText(tv, /Team A: \+2/);
  assert.match(await text(tv), new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const upNext = (await tv.locator('h2').filter({ hasText: 'Als Nächstes' }).innerText());

  // song 2: team B wrong -> B locked, A may buzz and wins
  r = await playing(ph);
  await buzzAndJudge(ph, r.fronts, r.judge, 'B', 'wrong');
  await until(async () => /GESPERRT/.test(await text(ph[r.fronts.B])), 'B locked');
  await buzzAndJudge(ph, r.fronts, r.judge, 'A', 'both');
  await waitText(tv, /Team A: \+2/);

  // song 3: A gets only the title; B then sees what is taken and can only win the artist
  r = await playing(ph);
  await buzzAndJudge(ph, r.fronts, r.judge, 'A', 'title');
  await ph[r.fronts.B].locator('.buzz').click();
  await until(() => has(ph[r.judge], /Schon vergeben: Titel/), 'taken hint');
  assert.equal(await btn(ph[r.judge], 'Nur Titel richtig').count(), 0);
  await btn(ph[r.judge], RIGHT.artist).click();

  await waitText(tv, /gewinnt|Unentschieden/, 12000);
  const end = await text(tv);
  assert.match(end, /Team A gewinnt/);
  assert.match(end, /Anna/);
  for (const n of NAMES) await waitText(ph[n], /dein spiel|schaust zu/i);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('host can skip a stuck song (two taps)', async () => {
  const world = await newWorld(browser, srv.url);
  const { tv, ph } = await startGame(world, { length: 2 });
  await ready(ph);
  await playing(ph);
  const skip = btn(ph.Anna, /(Song|Wirklich) überspringen/);
  await skip.click();
  assert.match(await text(ph.Anna), /Wirklich überspringen/);
  await skip.click();
  await waitText(tv, /Niemand hatte es/);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('a song that ends or a broken video moves the game on by itself', async () => {
  const world = await newWorld(browser, srv.url);
  const { tv, ph } = await startGame(world, { length: 3 });
  await ready(ph);
  await playing(ph);
  await tv.evaluate(() => window.__yt.o.events.onStateChange({ data: 0 }));   // video ended, nobody buzzed
  await waitText(tv, /Niemand hatte es/);
  await playing(ph);                                                           // next song
  await tv.evaluate(() => window.__yt.o.events.onError({ data: 150 }));       // embedding blocked
  await waitText(tv, /nicht verfügbar/);
  await waitText(tv, /Niemand hatte es/, 6000);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('intro mode: the song stops after 5 seconds and nobody scores', async () => {
  const world = await newWorld(browser, srv.url);
  const { tv, ph } = await startGame(world, { mode: 'intro', length: 2 });
  await ready(ph);
  await playing(ph);
  await waitText(tv, /Niemand hatte es/, 9000);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('language switch: German by default, English on tap, remembered after reload', async () => {
  const world = await newWorld(browser, srv.url);
  const p = await world.open('/play?p=Anna');
  assert.match(await text(p), /Neues Spiel starten/);
  await p.getByLabel('Language').click();
  assert.match(await text(p), /Create a new game/);
  await p.reload();
  assert.match(await text(p), /Create a new game/);
  const tv = await world.open('/?new&fast');
  await tv.click('#snd');
  await waitText(tv, /Scan to play/);   // same browser profile, so the TV picked up English too
  await tv.getByLabel('Language').click();
  await waitText(tv, /Zum Spielen scannen/);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('someone who joins mid-game watches and is told so', async () => {
  const world = await newWorld(browser, srv.url);
  const { ph } = await startGame(world, { length: 2 });
  await ready(ph);
  await playing(ph);
  const eva = await world.open('/play?p=Eva');
  await waitText(eva, /läuft schon/);
  await btn(eva, 'Spiel beitreten').click();
  await waitText(eva, /schaust zu/);
  assert.deepEqual(world.errors, []);
  await world.close();
});

test('the TV page can be reloaded mid-game and the game goes on', async () => {
  const world = await newWorld(browser, srv.url);
  const { tv, ph } = await startGame(world, { length: 2 });
  await ready(ph);
  let r = await playing(ph);
  await tv.goto(srv.url + '/?fast');                                           // reload without ?new keeps the saved game
  await until(async () => /Song 1 von 2/.test(await text(tv)), 'TV back in the song', 12000);
  await buzzAndJudge(ph, r.fronts, r.judge, 'A', 'both');
  await waitText(tv, /Team A: \+2/);
  assert.deepEqual(world.errors, []);
  await world.close();
});
