// Badges are worked out from your data each time, never stored, so editing a past day updates them.
import {
  allLoggedSets, countWeightIncreases, gymStatus, groupStreak, habitStreak, sessionIsDone,
  sessionWeekStreak, sessionsDoneInWeek, sessionTarget, weekOf, weekStart, addDays, habitDone,
} from './logic.js';

function perfectWeeks(state, plan, settings, todayIso) {
  const lastFull = weekOf(todayIso, settings.startDate) - 1;
  let count = 0;
  for (let w = 1; w <= Math.min(lastFull, plan.weeks); w += 1) {
    const start = weekStart(w, settings.startDate);
    const allHabits = [...Array(7).keys()].every((i) => plan.habits.every((h) => habitDone(state, addDays(start, i), h.id)));
    if (allHabits && sessionsDoneInWeek(state, w, settings) >= sessionTarget(w, plan, settings)) count += 1;
  }
  return count;
}

export function badges(state, plan, todayIso) {
  const s = state.settings;
  const sessionsDone = Object.values(state.sessions).filter(sessionIsDone).length;
  const physio = groupStreak(state, plan, 'physio', todayIso, s.startDate).best;
  const sleep = groupStreak(state, plan, 'sleep', todayIso, s.startDate).best;
  const rested = habitStreak(state, 'sleep_7', todayIso, s.startDate).best;
  const cap = habitStreak(state, 'app_cap', todayIso, s.startDate).best;
  const weekStreak = sessionWeekStreak(state, plan, s, todayIso).best;
  const increases = countWeightIncreases(state, plan);
  const heaviest = Math.max(0, ...allLoggedSets(state).map((x) => x.w).filter(Number.isFinite));
  const gymReady = gymStatus(state, plan).every((g) => g.ready) ? 1 : 0;
  const deloadDone = plan.deloadWeeks[0] && sessionsDoneInWeek(state, plan.deloadWeeks[0], s) >= sessionTarget(plan.deloadWeeks[0], plan, s) ? 1 : 0;
  const perfect = perfectWeeks(state, plan, s, todayIso);
  const retest = Object.values(state.sessions).some((x) => x.letter === 'R' && sessionIsDone(x)) ? 1 : 0;

  const list = [
    { id: 'first', icon: '1', title: 'First session', desc: 'Log your first lift', cur: sessionsDone, target: 1 },
    { id: 'week_full', icon: '3', title: 'Full week', desc: 'Every planned session in a week', cur: weekStreak, target: 1 },
    { id: 'weeks_4', icon: '4W', title: 'Four in a row', desc: '4 full weeks back to back', cur: weekStreak, target: 4 },
    { id: 'physio_7', icon: 'P7', title: 'Physio week', desc: 'Both physio blocks 7 days running', cur: physio, target: 7 },
    { id: 'physio_30', icon: 'P30', title: 'Physio habit', desc: 'Both physio blocks 30 days running', cur: physio, target: 30 },
    { id: 'rested_14', icon: '7h', title: 'Well rested', desc: '7+ hours asleep 14 nights running', cur: rested, target: 14 },
    { id: 'sleep_7', icon: 'Z7', title: 'Sleep week', desc: 'All sleep habits 7 nights running', cur: sleep, target: 7 },
    { id: 'cap_21', icon: 'S21', title: 'Three week cap', desc: 'Under the app cap 21 days running, as in Hunt et al.', cur: cap, target: 21 },
    { id: 'first_up', icon: '+', title: 'Heavier', desc: 'First weight increase', cur: increases, target: 1 },
    { id: 'ten_up', icon: '+10', title: 'Ten jumps', desc: '10 weight increases across lifts', cur: increases, target: 10 },
    { id: 'club_20', icon: '20', title: '20 kg club', desc: 'Any set with the 20 kg dumbbell', cur: heaviest >= plan.maxDumbbellKg ? 1 : 0, target: 1 },
    { id: 'deload', icon: 'D', title: 'Took the deload', desc: 'All sessions in week 6, at half sets', cur: deloadDone, target: 1 },
    { id: 'perfect', icon: '★', title: 'Perfect week', desc: 'Every habit, every day, every session', cur: perfect, target: 1 },
    { id: 'all_36', icon: '36', title: 'The full block', desc: '36 sessions logged', cur: sessionsDone, target: 36 },
    { id: 'retest', icon: 'R', title: 'Retested', desc: 'Week 12 retest done', cur: retest, target: 1 },
    { id: 'gym', icon: 'G', title: 'Gym ready', desc: 'Goblet squat and RDL maxed at 20 kg', cur: gymReady, target: 1 },
  ];
  return list.map((b) => ({ ...b, cur: Math.min(b.cur, b.target), earned: b.cur >= b.target }));
}
