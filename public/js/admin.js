import { D, r } from './db.js';
import { overlaySongs, ytId } from './game.js';
import { onUser, google, signIn, signOut, authError } from './auth.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let sel = null, prev = null, staticCat = [], staticLists = {}, dbI = null, dbS = null, user = null, emailV = '', pwV = '', authMsg = '', confirming = null, msg = '', msgAt = 0, undoFn = null, lastHtml = '', tab = 'lists', editing = null, filterV = '', newOpen = false;
const dr = { bulk: '', emoji: '', name: '', de: '' }; // drafts, so a rebuild never eats typed text
const rooms = {}; // room -> { ts, seenAt, pub }
D.onValue(r('roomIndex'), (s) => {
  const v = s.val() || {};
  for (const room of Object.keys(v)) {
    if (!rooms[room]) { rooms[room] = { ts: null, seenAt: 0, pub: null }; D.onValue(r(`rooms/${room}/public`), (p) => { rooms[room].pub = p.val(); render(); }); }
    if (v[room].ts !== rooms[room].ts) rooms[room].seenAt = Date.now(), rooms[room].ts = v[room].ts;
  }
  for (const room of Object.keys(rooms)) if (!(room in v)) delete rooms[room];
  render();
});
// ---- playlists: static songs/*.json with the database edits on top (same overlay as the TV) ----
(async () => { try { staticCat = await (await fetch('songs/index.json')).json(); await Promise.all(staticCat.map(async (c) => { staticLists[c.id] = await (await fetch(`songs/${c.id}.json`)).json(); })); render(); } catch (e) { msg = 'Could not load the static lists.'; } })();
D.onValue(r('songsIndex'), (s) => { dbI = s.val(); render(); });
D.onValue(r('songs'), (s) => { dbS = s.val(); render(); });
const merged = () => overlaySongs(staticCat, staticLists, dbI, dbS);
const clean = (o) => JSON.parse(JSON.stringify(o)); // Firebase refuses undefined
const toast = (m, undo) => { msg = m; msgAt = Date.now(); undoFn = undo || null; lastHtml = ''; render(); };
const guard = async (fn, ok = 'Saved ✓') => { try { await fn(); toast(ok); } catch (e) { toast('Refused: sign in with the admin account first.'); } };
const entryOf = (id) => merged().catalog.find((c) => c.id === id);
const putList = (id, entry, songs, ok) => guard(async () => { await D.set(r(`songs/${id}`), clean(songs)); await D.set(r(`songsIndex/${id}`), clean(entry)); }, ok);
const songsOf = (id) => merged().lists[id] || [];
const go = (f) => { f(); lastHtml = ''; render(); };
window.setTab = (t) => go(() => { tab = t; });
window.pick = (id) => go(() => { sel = id; prev = null; editing = null; filterV = ''; });
window.back = () => go(() => { sel = null; });
window.toggleNew = (open) => { newOpen = open; };
window.draft = (k, v) => { dr[k] = v; };
window.undo = () => { const f = undoFn; undoFn = null; msg = ''; if (f) f(); lastHtml = ''; render(); };
window.filt = (v) => { filterV = v.toLowerCase(); document.querySelectorAll('.srow').forEach((e) => { e.hidden = !!filterV && !e.dataset.q.includes(filterV); }); };
window.editList = (id, k, v) => { const e = entryOf(id); putList(id, { ...e, [k]: k === 'special' ? !!v : String(v).trim() }, songsOf(id)); };
window.newList = () => {
  const name = dr.name.trim(), id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return toast('Give the new list a name.');
  if (entryOf(id)) return toast('A list with that name exists already.');
  putList(id, { id, name, de: dr.de.trim() || name, emoji: dr.emoji.trim() || '🎵' }, [], 'List created ✓').then(() => { Object.assign(dr, { emoji: '', name: '', de: '' }); sel = id; newOpen = false; lastHtml = ''; render(); });
};
window.delList = (id) => { if (!confirm(`Delete the list "${entryOf(id)?.name}" with all its songs?`)) return; sel = null; guard(async () => { await D.set(r(`songsIndex/${id}`), { deleted: true }); await D.remove(r(`songs/${id}`)); }, 'List deleted'); };
window.importAll = () => { if (!confirm('Copy all static lists into the database? This overwrites database lists with the same id.')) return; guard(async () => { for (const c of staticCat) { await D.set(r(`songs/${c.id}`), clean(staticLists[c.id])); await D.set(r(`songsIndex/${c.id}`), clean(c)); } }, 'Imported ✓'); };
const check = (title, id, start) => !title.trim() ? 'The title must not be empty.' : !id ? 'That is not a YouTube id or link (11 characters).' : start !== '' && !(+start >= 0) ? 'The start offset must be a number of seconds.' : '';
window.editSong = (i) => go(() => { editing = editing === i ? null : i; prev = null; });
window.saveSong = (list, i) => {
  const o = songsOf(list)[i], v = (k) => $('e-' + k).value, id = ytId(v('id')), start = v('start').trim(), bad = check(v('title'), id, start);
  if (bad) return toast(bad);
  const n = { ...o, title: v('title').trim(), artist: v('artist').trim(), id };
  if (id !== o.id) { delete n.duration; delete n.ytTitle; }
  if (start === '') delete n.start; else n.start = +start;
  const l = [...songsOf(list)]; l[i] = n; editing = null; putList(list, entryOf(list), l);
};
window.delSong = (list, i) => { const old = songsOf(list), s = old[i]; prev = null; editing = null; putList(list, entryOf(list), old.filter((_, j) => j !== i), `Deleted "${s.title}"`).then(() => toast(`Deleted "${s.title}"`, () => putList(list, entryOf(list), old, 'Restored ✓'))); };
window.addSongs = async (list) => { // one line per song: a YouTube link, optionally "Artist - Title" before it; a bare link gets its title from YouTube
  const lines = dr.bulk.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return toast('Paste at least one YouTube link.');
  const add = [], bad = [];
  for (const line of lines) {
    const id = ytId(line); if (!id) { bad.push(line); continue; }
    let rest = line.replace(/https?:\/\/\S+/g, '').replace(/\|/g, ' ').trim(), artist = '', title = '';
    if (rest === id) rest = '';
    if (rest) { const m = rest.split(/\s+-\s+/); if (m.length > 1) { artist = m[0].trim(); title = m.slice(1).join(' - ').trim(); } else title = rest; }
    else try { const j = await (await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://youtu.be/' + id))).json(); title = j.title || ''; artist = (j.author_name || '').replace(/ - Topic$/, ''); } catch {}
    add.push({ id, title: title || `Untitled ${id}`, artist });
  }
  if (!add.length) return toast('No YouTube link found in what you pasted.');
  const old = songsOf(list);
  await putList(list, entryOf(list), [...old, ...add], `${add.length} song${add.length > 1 ? 's' : ''} added${bad.length ? `, ${bad.length} line(s) skipped` : ''}`);
  dr.bulk = ''; lastHtml = ''; render();
};
window.preview = (i) => go(() => { prev = prev === i ? null : i; });
let isAdmin = null; // null = checking; adminCheck is readable only by the admin user id (database rules), so no id sits in this file
onUser((u) => { user = u; isAdmin = null; lastHtml = ''; render(); if (u) D.get(r('adminCheck')).then(() => { isAdmin = true; lastHtml = ''; render(); }, () => { isAdmin = false; lastHtml = ''; render(); }); });
window.setEmail = (v) => { emailV = v; }; window.setPw = (v) => { pwV = v; };
window.doGoogle = async () => { try { await google(); } catch (e) { authMsg = authError(e); render(); } };
window.doSignIn = async () => { try { await signIn(emailV.trim(), pwV); } catch (e) { authMsg = authError(e); render(); } };
window.doSignOut = () => signOut();
setInterval(render, 1000);
window.ask = (room) => { confirming = room; lastHtml = ''; render(); };
window.cancel = () => { confirming = null; lastHtml = ''; render(); };
window.forget = (room) => D.remove(r(`roomIndex/${room}`));
window.kill = async (room) => { // the TV of that room reacts to the epoch
  confirming = null;
  try { await D.set(r(`rooms/${room}/admin/epoch`), Date.now()); toast(`Room ${room}: session killed, the TV and all phones are reset.`); } // the rules only accept this from the admin's user id
  catch (e) { toast('Refused: this account is not the admin.'); }
};
const roomCard = ([room, o]) => {
  const alive = o.seenAt && Date.now() - o.seenAt < 4000, p = o.pub, s = p?.summary, run = p?.session && s;
  return `<div class=card><div class=rhead><b>Room ${esc(room)}</b><span class="dot ${alive ? 'on' : ''}">${alive ? 'TV online' : 'TV offline'}</span></div>
    ${run ? `<div class=answer style="margin-top:8px">Game ${esc(p.code)}<small>${esc(s.phase)}${s.total ? ` · song ${s.idx + 1} of ${s.total}` : ''}${s.list ? ` · ${esc(s.list)} · ${esc(s.mode)}` : ''}</small></div>
      <p style="margin:8px 0">Score <b class=A>A ${s.scores.A}</b> : <b class=B>${s.scores.B} B</b></p><div class=chips>${s.players.map((q) => `<span class=chip>${esc(q.name)}${q.team ? ' · ' + q.team : ''}</span>`).join('')}</div>`
      : '<p class=hint style="margin:8px 0;text-align:left">No game running.</p>'}
    <div class=row style="margin-top:12px">${confirming === room
      ? `<span class=err>Kill the session for everyone?</span><button class="sb danger" onclick="kill('${room}')">Yes, kill it</button><button class="sb" onclick="cancel()">Cancel</button>`
      : `<button class="sb danger" onclick="ask('${room}')" ${run ? '' : 'disabled'}>Kill session</button>${alive ? '' : `<button class="sb" onclick="forget('${room}')">Remove from list</button>`}`}</div></div>`;
};
const inp = (v, on, cls = '', ph = '') => `<input class="fi ${cls}" value="${esc(v ?? '')}" placeholder="${ph}" onchange="${on}">`;
function listsView(M) {
  const cur = M.catalog.find((c) => c.id === sel), songs = cur ? (M.lists[cur.id] || []) : [];
  const side = `<aside class=side><div class=label>Playlists (${M.catalog.length})</div><div class=plist>${M.catalog.map((c) => `<button class="pi ${sel === c.id ? 'on' : ''}" onclick="pick('${c.id}')"><span class=em>${esc(c.emoji || '🎵')}</span><span class=nm>${esc(c.name)}${c.special ? ' <i>special</i>' : ''}</span><span class=ct>${(M.lists[c.id] || []).length}</span></button>`).join('')}</div>
    <details class=newl ${newOpen ? 'open' : ''} ontoggle="toggleNew(this.open)"><summary>+ New list</summary><div class=col>
      <input class=fi id=nl-emoji placeholder="🎵" value="${esc(dr.emoji)}" oninput="draft('emoji',this.value)" style="width:64px"><input class=fi id=nl-name placeholder="English name" value="${esc(dr.name)}" oninput="draft('name',this.value)"><input class=fi id=nl-de placeholder="Deutsch" value="${esc(dr.de)}" oninput="draft('de',this.value)">
      <button class="sb primary" onclick="newList()">Create</button></div></details>
    <button class="sb quiet" onclick="importAll()">Import static lists into DB</button></aside>`;
  const detail = !cur ? '<section class=detail><p class=hint style="text-align:left">Pick a playlist on the left.</p></section>' : `<section class=detail>
    <button class="sb back" onclick="back()">← All playlists</button>
    <div class=card><div class=row>${inp(cur.emoji, `editList('${cur.id}','emoji',this.value)`, 'w56')}${inp(cur.name, `editList('${cur.id}','name',this.value)`, 'grow', 'Name')}${inp(cur.de, `editList('${cur.id}','de',this.value)`, 'grow', 'Deutsch')}</div>
      <div class=row style="margin-top:10px"><label class=chk><input type=checkbox ${cur.special ? 'checked' : ''} onchange="editList('${cur.id}','special',this.checked)"> Special list (guess only the name)</label><span class=sp></span><button class="sb danger" onclick="delList('${cur.id}')">Delete list</button></div></div>
    <div class=card><div class=label style="margin:0 0 8px">Add songs</div>
      <textarea class=fi id=ns-bulk rows=3 placeholder="One song per line: paste a YouTube link. Optional: Artist - Title before the link. A bare link gets its title from YouTube." oninput="draft('bulk',this.value)">${esc(dr.bulk)}</textarea>
      <div class=row style="margin-top:8px"><button class="sb primary" onclick="addSongs('${cur.id}')">Add songs</button></div></div>
    <div class=row style="margin:14px 0 6px"><div class=label style="margin:0">${songs.length} songs</div><span class=sp></span><input class="fi grow" style="max-width:240px" placeholder="Search songs" value="${esc(filterV)}" oninput="filt(this.value)"></div>
    <div class=card style="padding:6px 8px">${songs.map((s, i) => `<div class=srow data-q="${esc((s.title + ' ' + s.artist).toLowerCase())}" ${filterV && !(s.title + ' ' + s.artist).toLowerCase().includes(filterV) ? 'hidden' : ''}>
      <div class=row><button class="ib" title=Preview onclick="preview(${i})">${prev === i ? '■' : '▶'}</button><div class=st><b>${esc(s.title)}</b><small>${esc(s.artist || 'no artist')}${s.start ? ` · from ${s.start}s` : ''}</small></div><span class=sp></span><button class="ib" title=Edit onclick="editSong(${i})">✎</button><button class="ib" title=Delete onclick="delSong('${cur.id}',${i})">🗑</button></div>
      ${editing === i ? `<div class=edit><input class=fi id=e-title placeholder=Title value="${esc(s.title)}"><input class=fi id=e-artist placeholder=Artist value="${esc(s.artist || '')}"><input class=fi id=e-id placeholder="YouTube id or link" value="${esc(s.id)}"><input class=fi id=e-start placeholder="Start (seconds)" value="${esc(s.start ?? '')}" style="max-width:160px"><div class=row><button class="sb primary" onclick="saveSong('${cur.id}',${i})">Save</button><button class=sb onclick="editSong(${i})">Cancel</button></div></div>` : ''}
      ${prev === i ? `<iframe class=pv allow="autoplay;encrypted-media" src="https://www.youtube.com/embed/${esc(s.id)}?start=${Math.floor(s.start || 0)}&autoplay=1"></iframe>` : ''}</div>`).join('') || '<p class=hint style="text-align:left;margin:10px">No songs yet.</p>'}</div></section>`;
  return `<div class="split ${cur ? 'has' : ''}">${side}${detail}</div>`;
}
function render() {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; // do not rebuild the page while something is typed
  if (!user || !isAdmin) {
    const h = `<h1>Admin</h1>${user ? (isAdmin === null ? '<p class=hint>Loading…</p>' : `<div class=card><p class=hint style="margin:0">This account is not the admin.</p><button class="sb" style="margin-top:10px" onclick="doSignOut()">Sign out</button></div>`)
      : `<div class=card style="max-width:420px"><div class=label style="margin:0 0 8px">Admin sign-in</div><div class=col><button class="sb primary big" onclick="doGoogle()">Continue with Google</button><input class=fi type=email placeholder=Email value="${esc(emailV)}" oninput="setEmail(this.value)"><input class=fi type=password placeholder=Password value="${esc(pwV)}" oninput="setPw(this.value)"><button class="sb" onclick="doSignIn()">Sign in</button>${authMsg ? `<p class=err style="margin:0">${esc(authMsg)}</p>` : ''}</div></div>`}`;
    if (h !== lastHtml) { lastHtml = h; $('main').innerHTML = h; }
    return;
  }
  const rl = Object.entries(rooms).sort(([a], [b]) => a.localeCompare(b)), live = rl.filter(([, o]) => o.seenAt && Date.now() - o.seenAt < 4000).length, M = merged();
  const toastOn = msg && Date.now() - msgAt < 6000;
  const html = `<header class=top><h1>Song Quiz Admin</h1><nav class=tabs><button class="${tab === 'lists' ? 'on' : ''}" onclick="setTab('lists')">Playlists</button><button class="${tab === 'rooms' ? 'on' : ''}" onclick="setTab('rooms')">Rooms${live ? ` <span class=badge>${live}</span>` : ''}</button></nav>
    <details class=acct><summary>${esc(user.email || user.displayName || 'Account')}</summary><div class=card><button class=sb onclick="doSignOut()">Sign out</button></div></details></header>
    ${tab === 'lists' ? listsView(M) : `<div class=grid>${rl.map(roomCard).join('') || '<div class=card><p class=hint style="margin:0">No room has been opened yet.</p></div>'}</div>`}
    ${toastOn ? `<div class=toast>${esc(msg)}${undoFn ? ' <button onclick="undo()">Undo</button>' : ''}</div>` : ''}`;
  if (html !== lastHtml) { lastHtml = html; $('main').innerHTML = html; }
}
render();
