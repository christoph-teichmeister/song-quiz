// Firebase Realtime Database wiring, shared by TV, phones and admin.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import * as D from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const db = D.getDatabase(initializeApp(firebaseConfig));
export const r = (path) => D.ref(db, path);
// Every game lives in its own room: /rooms/<room>/... ("main" is the party room, ?room=abc opens another one)
export const ROOM = (new URLSearchParams(location.search).get('room') || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'main';
export const rr = (path) => D.ref(db, `rooms/${ROOM}/${path}`);
export { D, db };
