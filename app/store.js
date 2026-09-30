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

export function validate(data, plan) {
  if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('Not a Training Tracker backup');
  const base = emptyState(plan);
  return {
    version: 1,
    settings: { ...base.settings, ...(data.settings || {}) },
    days: typeof data.days === 'object' && data.days ? data.days : {},
    sessions: typeof data.sessions === 'object' && data.sessions ? data.sessions : {},
  };
}

export function updateDay(state, iso, patch) {
  const day = state.days[iso] || { habits: {} };
  return { ...state, days: { ...state.days, [iso]: { ...day, ...patch } } };
}

export function toggleHabit(state, iso, habitId) {
  const day = state.days[iso] || { habits: {} };
  const habits = { ...(day.habits || {}), [habitId]: !day.habits?.[habitId] };
  return updateDay(state, iso, { habits });
}

export function updateSession(state, iso, patch) {
  const session = state.sessions[iso] || { sets: {}, reserve: {} };
  return { ...state, sessions: { ...state.sessions, [iso]: { ...session, ...patch } } };
}

export function setSetValue(state, iso, exId, index, field, value) {
  const session = state.sessions[iso] || { sets: {}, reserve: {} };
  const sets = [...(session.sets?.[exId] || [])];
  while (sets.length <= index) sets.push({});
  sets[index] = { ...sets[index], [field]: value };
  return updateSession(state, iso, { sets: { ...session.sets, [exId]: sets } });
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
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
