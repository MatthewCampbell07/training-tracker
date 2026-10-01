// Pure functions: no DOM, no storage. Imported by the app and by tests/logic.test.mjs.

const DAY_MS = 86400000;
// Weeks where priority (upper body) exercises get a 4th set, from the plan's 'Build, harder' phase.
const PRIORITY_WEEKS = [7, 11];

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS));
}

export function daysBetween(fromIso, toIsoDate) {
  return Math.round((parseIso(toIsoDate) - parseIso(fromIso)) / DAY_MS);
}

// 0 = Sunday ... 6 = Saturday, same as Date.getDay.
export function dayOfWeek(iso) {
  return parseIso(iso).getUTCDay();
}

export function localTodayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function weekOf(iso, startIso) {
  return Math.floor(daysBetween(startIso, iso) / 7) + 1;
}

export function weekStart(week, startIso) {
  return addDays(startIso, (week - 1) * 7);
}

export function inPlan(iso, plan, startIso) {
  const w = weekOf(iso, startIso);
  return w >= 1 && w <= plan.weeks;
}

export function phaseFor(week, plan) {
  return plan.phases.find((p) => week >= p.from && week <= p.to) || null;
}

export function isDeload(week, plan) {
  return plan.deloadWeeks.includes(week);
}

export function isGolfMode(iso, settings) {
  return Boolean(settings.golfFrom) && iso >= settings.golfFrom;
}

function normalLetter(iso, plan) {
  return plan.schedule.normal[String(dayOfWeek(iso))] || null;
}

// Which session (A, B, C, R or null) is scheduled on a date.
// The retest replaces the last session of the retest week, whatever weekday the plan starts on.
export function scheduledSession(iso, plan, settings) {
  if (!inPlan(iso, plan, settings.startDate)) return null;
  if (isGolfMode(iso, settings)) return plan.schedule.golf[String(dayOfWeek(iso))] || null;
  const letter = normalLetter(iso, plan);
  if (!letter) return null;
  const week = weekOf(iso, settings.startDate);
  if (week === plan.retestWeek) {
    const weekEnd = addDays(weekStart(week, settings.startDate), 6);
    let lastLift = weekEnd;
    while (!normalLetter(lastLift, plan)) lastLift = addDays(lastLift, -1);
    if (iso === lastLift) return 'R';
  }
  return letter;
}

export function setsFor(exercise, week, plan, golf) {
  if (exercise.sets === 1) return 1;
  if (golf) return 2;
  if (week === 1) return 2;
  if (isDeload(week, plan)) return Math.ceil(exercise.sets / 2);
  if (exercise.priority && week >= PRIORITY_WEEKS[0] && week <= PRIORITY_WEEKS[1]) return exercise.sets + 1;
  return exercise.sets;
}

export function hasRange(exercise) {
  return exercise.max !== null && exercise.max !== undefined;
}

function loggedSets(sets) {
  return (sets || []).filter((s) => Number.isFinite(s.r) && s.r > 0);
}

// 'up' when every required set reached the top of the range.
export function progressionCall(exercise, sets, requiredSets) {
  if (!hasRange(exercise)) return 'none';
  const done = loggedSets(sets);
  if (done.length < requiredSets) return 'incomplete';
  return done.every((s) => s.r >= exercise.max) ? 'up' : 'hold';
}

export function upMessage(exercise, weight = null, maxKg = Infinity) {
  if (exercise.load === 'db' && weight !== null && weight >= maxKg) return `At ${maxKg} kg: add a rep or a set, or slow the lowering to 4 sec`;
  if (exercise.load === 'db') return 'Add 1 to 2.5 kg next time';
  if (exercise.load === 'band') return 'Stronger band or step further out next time';
  return 'Make it harder next time: feet up or slower lowering';
}

export function topWeight(sets) {
  const ws = loggedSets(sets).map((s) => s.w).filter(Number.isFinite);
  return ws.length ? Math.max(...ws) : null;
}

export function sessionIsDone(session) {
  if (!session) return false;
  if (session.done) return true;
  return Object.values(session.sets || {}).some((sets) => loggedSets(sets).length > 0);
}

// Every logged performance of one exercise, oldest first.
export function exerciseHistory(state, exId) {
  return Object.keys(state.sessions)
    .sort()
    .map((date) => ({ date, sets: loggedSets(state.sessions[date].sets?.[exId]), session: state.sessions[date] }))
    .filter((h) => h.sets.length > 0);
}

export function lastPerformance(state, exId, beforeIso) {
  const hist = exerciseHistory(state, exId).filter((h) => h.date < beforeIso);
  return hist.length ? hist[hist.length - 1] : null;
}

export function countWeightIncreases(state, plan) {
  const ids = new Set(Object.values(plan.sessions).flatMap((s) => s.exercises.map((e) => e.id)));
  let count = 0;
  for (const id of ids) {
    let prev = null;
    for (const h of exerciseHistory(state, id)) {
      const w = topWeight(h.sets);
      if (w !== null && prev !== null && w > prev) count += 1;
      if (w !== null) prev = w;
    }
  }
  return count;
}

export function hasPain(session, exId) {
  return Boolean(session?.pain?.[exId]);
}

// Exercises with pain ticked in the last 14 days, most recent first.
export function recentPain(state, todayIso, days = 14) {
  const from = addDays(todayIso, -days);
  return Object.keys(state.sessions).sort().reverse()
    .filter((d) => d >= from && d <= todayIso)
    .flatMap((d) => Object.entries(state.sessions[d].pain || {}).filter(([, v]) => v).map(([exId]) => ({ date: d, exId })));
}

// Gym ready: each gymCheck lift at max dumbbell, top of range on all sets, 2+ in reserve.
export function gymStatus(state, plan) {
  const byId = Object.fromEntries(plan.sessions.A.exercises.map((e) => [e.id, e]));
  return plan.gymCheck.map((id) => {
    const ex = byId[id];
    const hist = exerciseHistory(state, id).filter((h) => !h.session.retest);
    const last = hist[hist.length - 1];
    if (!last) return { id, name: ex.name, ready: false, detail: 'Not logged yet' };
    const atMax = last.sets.every((s) => s.w >= plan.maxDumbbellKg);
    const atTop = last.sets.every((s) => s.r >= ex.max);
    const reserve = Boolean(last.session.reserve?.[id]);
    const pain = hasPain(last.session, id);
    const ready = atMax && atTop && reserve && !pain;
    const detail = `Last: ${topWeight(last.sets) ?? 0} kg, reps ${last.sets.map((s) => s.r).join(', ')}${reserve ? ', 2+ in reserve' : ''}${pain ? ', pain flagged' : ''}`;
    return { id, name: ex.name, ready, detail };
  });
}

export function habitDone(state, iso, habitId) {
  return Boolean(state.days[iso]?.habits?.[habitId]);
}

export function dayScore(state, iso, plan) {
  const done = plan.habits.filter((h) => habitDone(state, iso, h.id)).length;
  return done / plan.habits.length;
}

// Current streak counts back from today; if today is not ticked yet it starts from yesterday.
export function streak(isDoneOn, todayIso, earliestIso) {
  let day = isDoneOn(todayIso) ? todayIso : addDays(todayIso, -1);
  let current = 0;
  while (day >= earliestIso && isDoneOn(day)) {
    current += 1;
    day = addDays(day, -1);
  }
  let best = 0;
  let run = 0;
  for (let d = earliestIso; d <= todayIso; d = addDays(d, 1)) {
    run = isDoneOn(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best };
}

export function habitStreak(state, habitId, todayIso, startIso) {
  return streak((d) => habitDone(state, d, habitId), todayIso, startIso);
}

export function groupStreak(state, plan, group, todayIso, startIso) {
  const ids = plan.habits.filter((h) => h.group === group).map((h) => h.id);
  return streak((d) => ids.every((id) => habitDone(state, d, id)), todayIso, startIso);
}

export function sessionTarget(week, plan, settings) {
  let target = 0;
  for (let i = 0; i < 7; i += 1) {
    if (scheduledSession(addDays(weekStart(week, settings.startDate), i), plan, settings)) target += 1;
  }
  return target;
}

export function sessionsDoneInWeek(state, week, settings) {
  const start = weekStart(week, settings.startDate);
  let done = 0;
  for (let i = 0; i < 7; i += 1) {
    if (sessionIsDone(state.sessions[addDays(start, i)])) done += 1;
  }
  return done;
}

// Consecutive completed weeks where sessions hit the target, counting back from the last finished week.
export function sessionWeekStreak(state, plan, settings, todayIso) {
  const thisWeek = weekOf(todayIso, settings.startDate);
  const hit = (w) => w >= 1 && sessionsDoneInWeek(state, w, settings) >= sessionTarget(w, plan, settings);
  let w = hit(thisWeek) ? thisWeek : thisWeek - 1;
  let current = 0;
  while (w >= 1 && hit(w)) {
    current += 1;
    w -= 1;
  }
  let best = 0;
  let run = 0;
  for (let i = 1; i <= Math.min(thisWeek, plan.weeks); i += 1) {
    run = hit(i) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best };
}

// Minutes from "HH:MM" strings. Bedtimes after midnight count as the next day.
export function sleepHours(asleep, wake) {
  if (!asleep || !wake) return null;
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let a = toMin(asleep);
  const w = toMin(wake);
  if (a > w) a -= 24 * 60;
  const hours = (w - a) / 60;
  return hours > 0 && hours < 16 ? hours : null;
}

export function weekAverages(state, week, settings) {
  const start = weekStart(week, settings.startDate);
  const weights = [];
  const sleeps = [];
  for (let i = 0; i < 7; i += 1) {
    const day = state.days[addDays(start, i)];
    if (Number.isFinite(day?.weight)) weights.push(day.weight);
    const h = sleepHours(day?.asleep, day?.wake);
    if (h !== null) sleeps.push(h);
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { weight: avg(weights), weightCount: weights.length, sleep: avg(sleeps), sleepCount: sleeps.length };
}

export function weekAdherence(state, week, plan, settings, todayIso) {
  const start = weekStart(week, settings.startDate);
  let ticks = 0;
  let possible = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(start, i);
    if (d > todayIso) break;
    ticks += plan.habits.filter((h) => habitDone(state, d, h.id)).length;
    possible += plan.habits.length;
  }
  return possible ? ticks / possible : null;
}

export function allLoggedSets(state) {
  return Object.values(state.sessions).flatMap((s) => Object.values(s.sets || {}).flatMap(loggedSets));
}
