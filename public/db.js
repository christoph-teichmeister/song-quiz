// Firebase Realtime Database wiring, shared by TV and phones.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import * as D from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const db = D.getDatabase(initializeApp(firebaseConfig));
export const r = (path) => D.ref(db, path);
export { D };
