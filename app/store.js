// Local storage on the phone, plus immutable update helpers, backup and CSV export.

const KEY = 'training-tracker.v1';

export function emptyState(plan) {
  return { version: 1, settings: { startDate: plan.startDate, golfFrom: null }, days: {}, sessions: {} };
}

export function load(plan) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState(plan);
    return validate(JSON.parse(raw), plan);
  } catch (err) {
    console.error('Could not read saved data', err);
    return emptyState(plan);
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Could not save data', err);
    return false;
  }
}

// Start dates that were only ever the built-in default, never chosen by hand.
const OLD_DEFAULT_STARTS = ['2026-10-05'];

function migrateSettings(settings, plan) {
  return OLD_DEFAULT_STARTS.includes(settings.startDate) ? { ...settings, startDate: plan.startDate } : settings;
}

export function validate(data, plan) {
  if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('Not a Training Tracker backup');
  const base = emptyState(plan);
  return {
    version: 1,
    settings: migrateSettings({ ...base.settings, ...(data.settings || {}) }, plan),
    days: typeof data.days === 'object' && data.days ? data.days : {},
    sessions: typeof data.sessions === 'object' && data.sessions ? data.sessions : {},
  };
}

// Every day, session and the settings carry _t (last edit time) so two copies can be merged record by record.
const now = () => Date.now();

export function updateDay(state, iso, patch) {
  const day = state.days[iso] || { habits: {} };
  return { ...state, days: { ...state.days, [iso]: { ...day, ...patch, _t: now() } } };
}

export function toggleHabit(state, iso, habitId) {
  const day = state.days[iso] || { habits: {} };
  const habits = { ...(day.habits || {}), [habitId]: !day.habits?.[habitId] };
  return updateDay(state, iso, { habits });
}

export function updateSession(state, iso, patch) {
  const session = state.sessions[iso] || { sets: {}, reserve: {} };
  return { ...state, sessions: { ...state.sessions, [iso]: { ...session, ...patch, _t: now() } } };
}

export function setSetValue(state, iso, exId, index, field, value) {
  const session = state.sessions[iso] || { sets: {}, reserve: {} };
  const sets = [...(session.sets?.[exId] || [])];
  while (sets.length <= index) sets.push({});
  sets[index] = { ...sets[index], [field]: value };
  return updateSession(state, iso, { sets: { ...session.sets, [exId]: sets } });
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch, _t: now() } };
}

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  // b is the cloud copy: on a tie (e.g. data saved before edit times existed) the cloud wins.
  return (b._t || 0) >= (a._t || 0) ? b : a;
}

const NESTED = ['habits', 'sets', 'reserve', 'pain'];

// Same day or session edited on both copies: combine them, newer values winning field by field.
function combine(a, b) {
  if (!a || !b) return a || b;
  const [older, latest] = newer(a, b) === b ? [a, b] : [b, a];
  const out = { ...older, ...latest };
  for (const key of NESTED) {
    if (older[key] || latest[key]) out[key] = { ...(older[key] || {}), ...(latest[key] || {}) };
  }
  return out;
}

function mergeRecords(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[key] = combine(a?.[key], b?.[key]);
  return out;
}

// Merge the phone copy with the cloud copy: for each day and session, the most recently edited version wins.
export function mergeStates(local, remote) {
  if (!remote) return local;
  return {
    version: 1,
    settings: newer(local.settings, remote.settings),
    days: mergeRecords(local.days, remote.days),
    sessions: mergeRecords(local.sessions, remote.sessions),
  };
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function setsCsv(state) {
  const rows = [['date', 'session', 'exercise', 'set', 'weight_kg', 'reps_or_sec', 'reserve_2plus']];
  for (const date of Object.keys(state.sessions).sort()) {
    const s = state.sessions[date];
    for (const [exId, sets] of Object.entries(s.sets || {})) {
      sets.forEach((set, i) => {
        if (Number.isFinite(set.r)) rows.push([date, s.letter || '', exId, i + 1, set.w ?? '', set.r, s.reserve?.[exId] ? 1 : 0]);
      });
    }
  }
  return csv(rows);
}

export function daysCsv(state, plan) {
  const ids = plan.habits.map((h) => h.id);
  const rows = [['date', ...ids, 'weight_kg', 'asleep', 'wake']];
  for (const date of Object.keys(state.days).sort()) {
    const d = state.days[date];
    rows.push([date, ...ids.map((id) => (d.habits?.[id] ? 1 : 0)), d.weight ?? '', d.asleep ?? '', d.wake ?? '']);
  }
  return csv(rows);
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch (err) {
    console.error('Persistent storage request failed', err);
  }
  return false;
}
