// Firebase Auth (Google + email/password), shared by the phone page and the admin page.
import { app } from './db.js';
import * as A from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const auth = A.getAuth(app);
export const onUser = (cb) => A.onAuthStateChanged(auth, cb);
export const google = () => A.signInWithPopup(auth, new A.GoogleAuthProvider());
export const signIn = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
export const signUp = (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw);
export const resetPw = (email) => A.sendPasswordResetEmail(auth, email);
export const signOut = () => A.signOut(auth);
export const removeAccount = () => A.deleteUser(auth.currentUser);
// short, human error text for the sheet
export const authError = (e) => ({
  'auth/invalid-credential': 'Wrong email or password.', 'auth/invalid-email': 'That email address does not look right.',
  'auth/email-already-in-use': 'There is already an account with this email. Try signing in.', 'auth/weak-password': 'Use at least 6 characters for the password.',
  'auth/popup-closed-by-user': 'Sign-in was closed.', 'auth/requires-recent-login': 'For safety, sign in again first, then delete the account.',
  'auth/too-many-requests': 'Too many tries. Wait a moment.', 'auth/missing-password': 'Enter a password.',
}[e.code] || 'Something went wrong. Try again.');
