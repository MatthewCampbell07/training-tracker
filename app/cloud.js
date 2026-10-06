// Cloud backup: Firebase Auth (email and password) and one Firestore document per person, via the REST APIs.
// The API key below is a public project identifier, not a secret. Access is controlled by firestore.rules.
import { mergeStates, validate } from './store.js';

const API_KEY = 'AIzaSyC2Q-cv2XR1MgujkQlFubYZZaKvo15WoKI';
const PROJECT = 'mc-training-tracker';
const AUTH_KEY = 'training-tracker.auth';
// Local testing only: http://localhost:8765/?emu talks to the Firebase emulators instead of Google.
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emu');
const AUTH_BASE = EMU ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
const TOKEN_BASE = EMU ? 'http://127.0.0.1:9099/securetoken.googleapis.com' : 'https://securetoken.googleapis.com';
const STORE_BASE = EMU ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
const DOC_URL = (uid) => `${STORE_BASE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`;
const PUSH_DELAY_MS = 2000;

const MESSAGES = {
  EMAIL_EXISTS: 'That email already has an account. Tap Sign in instead.',
  INVALID_LOGIN_CREDENTIALS: 'Email or password is wrong.',
  INVALID_PASSWORD: 'Email or password is wrong.',
  EMAIL_NOT_FOUND: 'No account with that email. Tap Create account.',
  INVALID_EMAIL: 'That email address does not look right.',
  OPERATION_NOT_ALLOWED: 'Email sign in is not switched on in Firebase yet.',
  CONFIGURATION_NOT_FOUND: 'Email sign in is not switched on in Firebase yet.',
  ADMIN_ONLY_OPERATION: 'New accounts are switched off for this app.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes.',
};

let auth = readAuth();
let status = { signedIn: Boolean(auth), email: auth?.email || '', lastSync: null, error: '', busy: false };
let hooks = { getState: null, setState: null, onStatus: () => {} };
let pushTimer = null;

function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeAuth(value) {
  auth = value;
  try {
    if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_KEY);
  } catch (err) {
    console.error('Could not store sign in', err);
  }
}

function setStatus(patch) {
  status = { ...status, ...patch };
  hooks.onStatus(status);
}

export function cloudStatus() {
  return status;
}

async function authCall(path, body) {
  const res = await fetch(`${AUTH_BASE}/v1/${path}?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const code = String(json.error?.message || 'UNKNOWN').split(' ')[0];
    throw new Error(MESSAGES[code] || `Sign in failed (${code}).`);
  }
  return json;
}

function saveTokens(json) {
  writeAuth({
    uid: json.localId || json.user_id,
    email: json.email || auth?.email || '',
    idToken: json.idToken || json.id_token,
    refreshToken: json.refreshToken || json.refresh_token,
    expiresAt: Date.now() + (Number(json.expiresIn || json.expires_in) - 60) * 1000,
  });
}

async function idToken() {
  if (!auth) throw new Error('Not signed in');
  if (Date.now() < auth.expiresAt) return auth.idToken;
  const res = await fetch(`${TOKEN_BASE}/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`,
  });
  const json = await res.json();
  if (!res.ok) {
    writeAuth(null);
    setStatus({ signedIn: false, error: 'Signed out. Please sign in again.' });
    throw new Error('Session expired');
  }
  saveTokens(json);
  return auth.idToken;
}

async function pull(plan) {
  const res = await fetch(DOC_URL(auth.uid), { headers: { Authorization: `Bearer ${await idToken()}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load cloud copy (${res.status})`);
  const doc = await res.json();
  return validate(JSON.parse(doc.fields.data.stringValue), plan);
}

async function push(state) {
  const body = { fields: { data: { stringValue: JSON.stringify(state) }, updatedAt: { integerValue: String(Date.now()) } } };
  const res = await fetch(DOC_URL(auth.uid), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await idToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Could not save to the cloud (${res.status})`);
}

// Pull, merge with the phone copy, keep the merged result on both sides.
export async function syncNow(plan) {
  if (!auth || status.busy) return;
  if (!navigator.onLine) return setStatus({ error: 'Offline. Will save when you have signal.' });
  setStatus({ busy: true, error: '' });
  try {
    const merged = mergeStates(hooks.getState(), await pull(plan));
    hooks.setState(merged);
    await push(merged);
    setStatus({ busy: false, lastSync: Date.now() });
  } catch (err) {
    console.error('Cloud sync failed', err);
    setStatus({ busy: false, error: err.message });
  }
  return undefined;
}

export function schedulePush() {
  if (!auth) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await push(hooks.getState());
      setStatus({ lastSync: Date.now(), error: '' });
    } catch (err) {
      console.error('Cloud save failed', err);
      setStatus({ error: navigator.onLine ? err.message : 'Offline. Will save when you have signal.' });
    }
  }, PUSH_DELAY_MS);
}

export async function signIn(plan, email, password, create) {
  if (!email || !password) return setStatus({ error: 'Enter your email and a password.' });
  if (create && password.length < 6) return setStatus({ error: 'Use a password of at least 6 characters.' });
  setStatus({ busy: true, error: '' });
  try {
    const json = await authCall(create ? 'accounts:signUp' : 'accounts:signInWithPassword', { email, password, returnSecureToken: true });
    saveTokens(json);
    setStatus({ busy: false, signedIn: true, email: auth.email });
    await syncNow(plan);
  } catch (err) {
    setStatus({ busy: false, error: err.message });
  }
  return undefined;
}

export async function resetPassword(email) {
  if (!email) return setStatus({ error: 'Enter your email first.' });
  try {
    await authCall('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email });
    setStatus({ error: 'Password reset email sent.' });
  } catch (err) {
    setStatus({ error: err.message });
  }
  return undefined;
}

export function signOut() {
  writeAuth(null);
  setStatus({ signedIn: false, email: '', lastSync: null, error: '' });
}

export function initCloud(plan, h) {
  hooks = { ...hooks, ...h };
  window.addEventListener('online', () => syncNow(plan));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow(plan);
  });
  syncNow(plan);
}
