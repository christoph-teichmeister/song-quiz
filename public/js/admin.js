import { D, r } from './db.js';
import { overlaySongs, ytId } from './game.js';
import { onUser, google, signIn, signOut, authError } from './auth.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let sel = null, prev = null, staticCat = [], staticLists = {}, dbI = null, dbS = null, user = null, emailV = '', pwV = '', authMsg = '', confirming = null, msg = '', lastHtml = '';
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
const guard = async (fn) => { try { await fn(); msg = ''; } catch (e) { msg = 'Refused: sign in with the admin account first.'; } lastHtml = ''; render(); };
const entryOf = (id) => merged().catalog.find((c) => c.id === id);
const putList = (id, entry, songs) => guard(async () => { await D.set(r(`songs/${id}`), clean(songs)); await D.set(r(`songsIndex/${id}`), clean(entry)); });
const songsOf = (id) => merged().lists[id] || [];
window.pick = (id) => { sel = sel === id ? null : id; prev = null; lastHtml = ''; render(); };
window.editList = (id, k, v) => { const e = entryOf(id); putList(id, { ...e, [k]: k === 'special' ? !!v : String(v).trim() }, songsOf(id)); };
window.newList = () => {
  const name = $('nl-name').value.trim(), id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) { msg = 'Give the new list a name.'; return render(); }
  if (entryOf(id)) { msg = 'A list with that name exists already.'; return render(); }
  putList(id, { id, name, de: $('nl-de').value.trim() || name, emoji: $('nl-emoji').value.trim() || '🎵' }, []).then(() => { sel = id; lastHtml = ''; render(); });
};
window.delList = (id) => { if (!confirm(`Delete the list "${entryOf(id)?.name}" with all its songs?`)) return; sel = null; guard(async () => { await D.set(r(`songsIndex/${id}`), { deleted: true }); await D.remove(r(`songs/${id}`)); }); };
window.importAll = () => { if (!confirm('Copy all static lists into the database? This overwrites database lists with the same id.')) return; guard(async () => { for (const c of staticCat) { await D.set(r(`songs/${c.id}`), clean(staticLists[c.id])); await D.set(r(`songsIndex/${c.id}`), clean(c)); } }).then(() => { if (!msg) msg = 'Imported.'; render(); }); };
const check = (title, id, start) => !title.trim() ? 'The title must not be empty.' : !id ? 'That is not a YouTube id or link (11 characters).' : start !== '' && !(+start >= 0) ? 'The start offset must be a number of seconds.' : '';
window.editSong = (list, i, k, v) => {
  const l = [...songsOf(list)], o = l[i], id = k === 'id' ? ytId(v) : o.id, title = k === 'title' ? v : o.title, start = k === 'start' ? v.trim() : String(o.start ?? '');
  const bad = check(title, id, start);
  if (bad) { msg = bad; lastHtml = ''; return render(); }
  const n = { ...o, title: title.trim(), id }; if (k === 'artist') n.artist = v.trim();
  if (k === 'id' && id !== o.id) { delete n.duration; delete n.ytTitle; }
  if (start === '') delete n.start; else n.start = +start;
  l[i] = n; putList(list, entryOf(list), l);
};
window.delSong = (list, i) => { prev = null; putList(list, entryOf(list), songsOf(list).filter((_, j) => j !== i)); };
window.addSong = (list) => {
  const v = (k) => $('ns-' + k).value, id = ytId(v('id')), bad = check(v('title'), id, v('start').trim());
  if (bad) { msg = bad; lastHtml = ''; return render(); }
  const n = { id, title: v('title').trim(), artist: v('artist').trim() }; if (v('start').trim() !== '') n.start = +v('start');
  putList(list, entryOf(list), [...songsOf(list), n]);
};
window.preview = (i) => { prev = prev === i ? null : i; lastHtml = ''; render(); };
onUser((u) => { user = u; lastHtml = ''; render(); });
window.setEmail = (v) => { emailV = v; }; window.setPw = (v) => { pwV = v; };
window.doGoogle = async () => { try { await google(); } catch (e) { authMsg = authError(e); render(); } };
window.doSignIn = async () => { try { await signIn(emailV.trim(), pwV); } catch (e) { authMsg = authError(e); render(); } };
window.doSignOut = () => signOut();
setInterval(render, 1000);
window.ask = (room) => { confirming = room; render(); };
window.cancel = () => { confirming = null; render(); };
window.forget = (room) => D.remove(r(`roomIndex/${room}`));
window.kill = async (room) => { // the TV of that room reacts to the epoch
  confirming = null;
  try {
    await D.set(r(`rooms/${room}/admin/epoch`), Date.now()); // the rules only accept this from the admin's user id
    msg = `Room ${room}: session killed, the TV and all phones are reset.`;
  } catch (e) { msg = 'Refused: this account is not the admin.'; }
  render();
};
function render() {
  if (document.activeElement?.tagName === 'INPUT') return; // do not rebuild the page while something is typed
  const list = Object.entries(rooms).sort(([a], [b]) => a.localeCompare(b));
  const card = ([room, o]) => {
    const alive = o.seenAt && Date.now() - o.seenAt < 4000, p = o.pub, s = p?.summary, run = p?.session && s;
    return `<div class=card><div style="display:flex;justify-content:space-between;gap:8px"><b>Room ${esc(room)}</b><b style="color:var(${alive ? '--ok' : '--mute'})">${alive ? 'TV online' : 'TV offline'}</b></div>
      ${run ? `<div class=answer style="margin-top:8px">Game ${esc(p.code)}<small>${esc(s.phase)}${s.total ? ` · song ${s.idx + 1} of ${s.total}` : ''}${s.list ? ` · ${esc(s.list)} · ${esc(s.mode)}` : ''}</small></div>
        <p style="margin:8px 0">Score <b class=A>A ${s.scores.A}</b> : <b class=B>${s.scores.B} B</b></p><div class=chips>${s.players.map((q) => `<span class=chip>${esc(q.name)}${q.team ? ' · ' + q.team : ''}</span>`).join('')}</div>`
        : '<p class=hint style="margin:8px 0;text-align:left">No game running.</p>'}
      <div class=stack style="margin-top:12px">${confirming === room
        ? `<p class=err style="margin:0">Kill the session for everyone?</p><button class=btn onclick="kill('${room}')">Yes, kill it</button><button class="btn ghost" onclick="cancel()">Cancel</button>`
        : `<button class=btn onclick="ask('${room}')" ${run ? '' : 'disabled'}>Kill session</button>${alive ? '' : `<button class="btn ghost" onclick="forget('${room}')">Remove from list</button>`}`}</div></div>`;
  };
  const who = user ? `<div class=card><div class=label style="margin:0 0 4px">Signed in</div>${esc(user.email || user.displayName || '')}<div class=hint style="text-align:left;margin-top:6px;word-break:break-all">User id: ${esc(user.uid)}</div><button class="btn ghost" style="margin-top:10px" onclick="doSignOut()">Sign out</button></div>`
    : `<div class=card><div class=label style="margin:0 0 8px">Admin sign-in</div><div class=stack><button class=btn onclick="doGoogle()">Continue with Google</button><input class=input id=keyin2 type=email placeholder=Email value="${esc(emailV)}" oninput="setEmail(this.value)"><input class=input id=keyin3 type=password placeholder=Password value="${esc(pwV)}" oninput="setPw(this.value)"><button class="btn ghost" onclick="doSignIn()">Sign in</button>${authMsg ? `<p class=err style="margin:0">${esc(authMsg)}</p>` : ''}</div></div>`;
  const M = merged(), cur = M.catalog.find((c) => c.id === sel), inp = (v, on, w = '', ph = '') => `<input class=input style="min-height:40px;padding:0 10px;border-radius:10px;${w}" value="${esc(v ?? '')}" placeholder="${ph}" onchange="${on}">`;
  const nf = (id, ph, w) => `<input class=input id=${id} placeholder="${ph}" style="${w};min-height:40px;padding:0 10px;border-radius:10px">`, row = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px', sm = 'min-height:40px';
  const plist = `<div class=label>Playlists (${M.catalog.length})</div>${user ? '' : '<p class=hint style="text-align:left">Sign in to edit.</p>'}
    <div class=card>${M.catalog.map((c) => `<div style="${row}">${inp(c.emoji, `editList('${c.id}','emoji',this.value)`, 'width:56px')}${inp(c.name, `editList('${c.id}','name',this.value)`, 'flex:1;min-width:110px', 'Name')}${inp(c.de, `editList('${c.id}','de',this.value)`, 'flex:1;min-width:110px', 'Deutsch')}
      <label class=hint style="margin:0"><input type=checkbox ${c.special ? 'checked' : ''} onchange="editList('${c.id}','special',this.checked)"> special</label><span class=hint style="margin:0">${(M.lists[c.id] || []).length} songs</span>
      <button class="btn ghost" style="${sm}" onclick="pick('${c.id}')">${sel === c.id ? 'Close' : 'Songs'}</button><button class="btn ghost" style="${sm}" onclick="delList('${c.id}')">Delete</button></div>`).join('')}
    <div style="${row};margin-top:12px">${nf('nl-emoji', '🎵', 'width:56px')}${nf('nl-name', 'New list, English name', 'flex:1;min-width:120px')}${nf('nl-de', 'Deutsch', 'flex:1;min-width:100px')}<button class=btn style="${sm}" onclick="newList()">Create</button></div>
    <button class="btn ghost" onclick="importAll()">Import static lists into DB</button></div>`;
  const songs = cur ? (M.lists[cur.id] || []) : [], f = (i, k, v, w, ph) => inp(v, `editSong('${cur.id}',${i},'${k}',this.value)`, w, ph);
  const stable = !cur ? '' : `<div class=label>${esc(cur.emoji || '')} ${esc(cur.name)}: ${songs.length} songs</div><div class=card>${songs.map((s, i) => `<div style="${row}">${f(i, 'title', s.title, 'flex:2;min-width:130px', 'Title')}${f(i, 'artist', s.artist, 'flex:2;min-width:110px', 'Artist')}${f(i, 'id', s.id, 'width:130px', 'YouTube id or link')}${f(i, 'start', s.start, 'width:64px', 'Start s')}
      <button class="btn ghost" style="${sm}" onclick="preview(${i})">${prev === i ? 'Hide' : 'Preview'}</button><button class="btn ghost" style="${sm}" onclick="delSong('${cur.id}',${i})">Delete</button>
      ${prev === i ? `<iframe style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px" allow="autoplay;encrypted-media" src="https://www.youtube.com/embed/${esc(s.id)}?start=${Math.floor(s.start || 0)}&autoplay=1"></iframe>` : ''}</div>`).join('')}
    <div style="${row};margin-top:12px">${nf('ns-title', 'Title', 'flex:2;min-width:130px')}${nf('ns-artist', 'Artist', 'flex:2;min-width:110px')}${nf('ns-id', 'YouTube id or link', 'width:130px')}${nf('ns-start', 'Start s', 'width:64px')}<button class=btn style="${sm}" onclick="addSong('${cur.id}')">Add song</button></div></div>`;
  const html = `<h1>Admin</h1>${who}${plist}${stable}<div class=label>Rooms (${list.length})</div>${list.map(card).join('') || '<div class=card><p class=hint style="margin:0">No room has been opened yet.</p></div>'}${msg ? `<p class=hint>${esc(msg)}</p>` : ''}`;
  if (html !== lastHtml) { lastHtml = html; $('main').innerHTML = html; }
}
render();
