import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../app/logic.js';
import { badges } from '../app/badges.js';

const plan = JSON.parse(readFileSync(new URL('../app/plan.json', import.meta.url)));
const settings = { startDate: '2026-10-01', golfFrom: null };
const empty = () => ({ version: 1, settings, days: {}, sessions: {} });
const goblet = plan.sessions.A.exercises.find((e) => e.id === 'goblet_squat');

test('weeks run Thursday to Wednesday from a Thursday start', () => {
  assert.equal(L.weekOf('2026-10-01', settings.startDate), 1);
  assert.equal(L.weekOf('2026-10-07', settings.startDate), 1);
  assert.equal(L.weekOf('2026-10-08', settings.startDate), 2);
  assert.equal(L.weekOf('2026-11-05', settings.startDate), 6);
  assert.equal(L.weekOf('2026-12-23', settings.startDate), 12);
  assert.equal(L.weekOf('2026-09-30', settings.startDate), 0);
});

test('week numbers ignore the clock change on 25 Oct', () => {
  assert.equal(L.weekOf('2026-10-21', settings.startDate), 3);
  assert.equal(L.weekOf('2026-10-25', settings.startDate), 4);
  assert.equal(L.weekOf('2026-10-28', settings.startDate), 4);
  assert.equal(L.weekOf('2026-10-29', settings.startDate), 5);
});

test('Monday A, Wednesday B, Friday C, nothing on rest days', () => {
  assert.equal(L.scheduledSession('2026-10-01', plan, settings), null);
  assert.equal(L.scheduledSession('2026-10-02', plan, settings), 'C');
  assert.equal(L.scheduledSession('2026-10-05', plan, settings), 'A');
  assert.equal(L.scheduledSession('2026-10-06', plan, settings), null);
  assert.equal(L.scheduledSession('2026-10-07', plan, settings), 'B');
  assert.equal(L.scheduledSession('2026-10-09', plan, settings), 'C');
  assert.equal(L.scheduledSession('2026-10-10', plan, settings), null);
});

test('the retest is the last session of week 12 and nothing comes after', () => {
  assert.equal(L.scheduledSession('2026-12-18', plan, settings), 'C');
  assert.equal(L.scheduledSession('2026-12-21', plan, settings), 'A');
  assert.equal(L.scheduledSession('2026-12-23', plan, settings), 'R');
  assert.equal(L.scheduledSession('2026-12-25', plan, settings), null);
});

test('a Monday start still puts the retest on the week 12 Friday', () => {
  assert.equal(L.scheduledSession('2026-12-25', plan, { ...settings, startDate: '2026-10-05' }), 'R');
});

test('golf mode drops Friday from its start date only', () => {
  const golf = { ...settings, golfFrom: '2026-11-16' };
  assert.equal(L.scheduledSession('2026-11-13', plan, golf), 'C');
  assert.equal(L.scheduledSession('2026-11-20', plan, golf), null);
  assert.equal(L.scheduledSession('2026-11-18', plan, golf), 'B');
  assert.equal(L.sessionTarget(7, plan, golf), 3);
  assert.equal(L.sessionTarget(8, plan, golf), 2);
});

test('sets: 2 in week 1, 3 normally, 2 on deloads, 2 in golf mode', () => {
  assert.equal(L.setsFor(goblet, 1, plan, false), 2);
  assert.equal(L.setsFor(goblet, 3, plan, false), 3);
  assert.equal(L.setsFor(goblet, 6, plan, false), 2);
  assert.equal(L.setsFor(goblet, 12, plan, false), 2);
  assert.equal(L.setsFor(goblet, 8, plan, true), 2);
});

test('upper body priority lifts get a 4th set in weeks 7 to 11 only', () => {
  const press = plan.sessions.A.exercises.find((e) => e.id === 'floor_press');
  assert.equal(L.setsFor(press, 6, plan, false), 2);
  assert.equal(L.setsFor(press, 7, plan, false), 4);
  assert.equal(L.setsFor(press, 11, plan, false), 4);
  assert.equal(L.setsFor(press, 12, plan, false), 2);
  assert.equal(L.setsFor(press, 8, plan, true), 2);
  assert.equal(L.setsFor(goblet, 8, plan, false), 3);
});

test('add weight only when every set hits the top of the range', () => {
  assert.equal(L.progressionCall(goblet, [{ w: 12, r: 12 }, { w: 12, r: 12 }, { w: 12, r: 12 }], 3), 'up');
  assert.equal(L.progressionCall(goblet, [{ w: 12, r: 12 }, { w: 12, r: 11 }, { w: 12, r: 12 }], 3), 'hold');
  assert.equal(L.progressionCall(goblet, [{ w: 12, r: 12 }, { w: 12, r: 12 }], 3), 'incomplete');
});

test('streak counts back from yesterday when today is not ticked yet', () => {
  const done = new Set(['2026-10-05', '2026-10-06', '2026-10-07']);
  const s = L.streak((d) => done.has(d), '2026-10-08', '2026-10-05');
  assert.deepEqual(s, { current: 3, best: 3 });
  const broken = L.streak((d) => done.has(d), '2026-10-10', '2026-10-05');
  assert.deepEqual(broken, { current: 0, best: 3 });
});

test('sleep hours cross midnight', () => {
  assert.equal(L.sleepHours('23:30', '06:15'), 6.75);
  assert.equal(L.sleepHours('00:30', '07:30'), 7);
  assert.equal(L.sleepHours('', '07:30'), null);
});

test('gym check needs 20 kg, 12 reps on every set and 2+ in reserve', () => {
  const at20 = [{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 12 }];
  const state = {
    ...empty(),
    sessions: {
      '2026-11-02': { letter: 'A', sets: { goblet_squat: at20, db_rdl: at20 }, reserve: { goblet_squat: true, db_rdl: false } },
    },
  };
  const g = L.gymStatus(state, plan);
  assert.equal(g.find((x) => x.id === 'goblet_squat').ready, true);
  assert.equal(g.find((x) => x.id === 'db_rdl').ready, false);
});

test('weight increases are counted per exercise', () => {
  const state = {
    ...empty(),
    sessions: {
      '2026-10-05': { letter: 'A', sets: { goblet_squat: [{ w: 12, r: 12 }] } },
      '2026-10-12': { letter: 'A', sets: { goblet_squat: [{ w: 14, r: 10 }] } },
      '2026-10-19': { letter: 'A', sets: { goblet_squat: [{ w: 14, r: 12 }] } },
    },
  };
  assert.equal(L.countWeightIncreases(state, plan), 1);
});

test('badges unlock from data and show progress when locked', () => {
  const state = { ...empty(), sessions: { '2026-10-05': { letter: 'A', done: true, sets: {} } } };
  const list = badges(state, plan, '2026-10-06');
  assert.equal(list.find((b) => b.id === 'first').earned, true);
  const all = list.find((b) => b.id === 'all_36');
  assert.equal(all.earned, false);
  assert.equal(all.cur, 1);
});

test('at the 20 kg limit the call switches to reps, sets or slower lowering', () => {
  assert.equal(L.upMessage(goblet, 18, 20), 'Add 1 to 2.5 kg next time');
  assert.match(L.upMessage(goblet, 20, 20), /^At 20 kg: add a rep/);
});

test('pain flag blocks the gym check and shows up in recent pain', () => {
  const at20 = [{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 12 }];
  const state = {
    ...empty(),
    sessions: {
      '2026-11-02': { letter: 'A', sets: { goblet_squat: at20 }, reserve: { goblet_squat: true }, pain: { goblet_squat: true } },
    },
  };
  assert.equal(L.gymStatus(state, plan).find((x) => x.id === 'goblet_squat').ready, false);
  assert.deepEqual(L.recentPain(state, '2026-11-05'), [{ date: '2026-11-02', exId: 'goblet_squat' }]);
  assert.deepEqual(L.recentPain(state, '2026-11-30'), []);
});

test('every exercise and warm-up item has written steps', () => {
  const keys = [
    ...Object.values(plan.sessions).flatMap((s) => s.exercises.map((e) => e.how || e.id)),
    ...plan.warmup.map((w) => w.how),
  ];
  for (const k of keys) {
    assert.ok(plan.howTo[k]?.steps?.length >= 3, `missing steps for ${k}`);
  }
});

const pushUp = plan.sessions.C.exercises.find((e) => e.id === 'push_up');
const withHistory = (sessions, extra = {}) => ({ ...empty(), settings: { ...settings, ...extra }, sessions });

test('suggestion: beat last time by one rep a set at the same weight', () => {
  const st = withHistory({ '2026-10-05': { letter: 'A', sets: { goblet_squat: [{ w: 12, r: 10 }, { w: 12, r: 9 }, { w: 12, r: 12 }] } } });
  const s = L.suggestFor(st, plan, goblet, '2026-10-12');
  assert.equal(s.w, 12);
  assert.deepEqual(s.reps, [11, 10, 12]);
});

test('suggestion: top of range on every set adds the jump and drops to the bottom of the range', () => {
  const st = withHistory({ '2026-10-05': { letter: 'A', sets: { goblet_squat: [{ w: 12, r: 12 }, { w: 12, r: 12 }] } } }, { jumpKg: 2.5 });
  const s = L.suggestFor(st, plan, goblet, '2026-10-12');
  assert.equal(s.w, 14.5);
  assert.deepEqual(s.reps, [8, 8, 8]);
});

test('suggestion: never above 20 kg, adds reps instead', () => {
  const st = withHistory({ '2026-10-05': { letter: 'A', sets: { goblet_squat: [{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 12 }] } } });
  const s = L.suggestFor(st, plan, goblet, '2026-10-12');
  assert.equal(s.w, 20);
  assert.deepEqual(s.reps, [13, 13, 13]);
});

test('suggestion: bodyweight exercises get reps only', () => {
  const st = withHistory({ '2026-10-02': { letter: 'C', sets: { push_up: [{ r: 8 }, { r: 7 }] } } });
  const s = L.suggestFor(st, plan, pushUp, '2026-10-09');
  assert.equal(s.w, null);
  assert.deepEqual(s.reps, [9, 8, 8]);
});

test('suggestion: pain or deload means no push', () => {
  const pain = withHistory({ '2026-10-05': { letter: 'A', sets: { goblet_squat: [{ w: 12, r: 12 }, { w: 12, r: 12 }] }, pain: { goblet_squat: true } } });
  assert.equal(L.suggestFor(pain, plan, goblet, '2026-10-12').w, 12);
  const deload = withHistory({ '2026-11-02': { letter: 'A', sets: { goblet_squat: [{ w: 16, r: 12 }, { w: 16, r: 12 }, { w: 16, r: 12 }] } } });
  const s = L.suggestFor(deload, plan, goblet, '2026-11-09');
  assert.equal(s.w, 16);
  assert.deepEqual(s.reps, [8, 8]);
});

test('suggestion: first time gives guidance, no numbers', () => {
  const s = L.suggestFor(empty(), plan, goblet, '2026-10-05');
  assert.equal(s.w, null);
  assert.deepEqual(s.reps, []);
});

test('time steps wrap round midnight', () => {
  assert.equal(L.addMinutes('23:45', 15), '00:00');
  assert.equal(L.addMinutes('00:00', -15), '23:45');
  assert.equal(L.addMinutes('06:15', 15), '06:30');
});

test('merge keeps the most recently edited version of each day and session', async () => {
  const { mergeStates } = await import('../app/store.js');
  const phone = { version: 1, settings: { startDate: '2026-10-01', _t: 1 },
    days: { '2026-10-06': { habits: { physio_am: true }, _t: 50 } }, sessions: {} };
  const cloud = { version: 1, settings: { startDate: '2026-10-01', golfFrom: '2026-11-16', _t: 9 },
    days: { '2026-10-02': { habits: { physio_am: true }, _t: 10 }, '2026-10-06': { habits: {}, _t: 5 } },
    sessions: { '2026-10-02': { letter: 'C', done: true, _t: 10 } } };
  const m = mergeStates(phone, cloud);
  assert.equal(m.settings.golfFrom, '2026-11-16');
  assert.equal(m.days['2026-10-06'].habits.physio_am, true);
  assert.ok(m.days['2026-10-02']);
  assert.equal(m.sessions['2026-10-02'].letter, 'C');
});

test('a fresh install merged with the cloud loses nothing', async () => {
  const { mergeStates, emptyState } = await import('../app/store.js');
  const cloud = { ...emptyState(plan), days: { '2026-10-02': { habits: { physio_am: true }, _t: 10 } } };
  const m = mergeStates(emptyState(plan), cloud);
  assert.deepEqual(Object.keys(m.days), ['2026-10-02']);
});

test('fresh install does not overwrite cloud settings saved before edit times existed', async () => {
  const { mergeStates, emptyState } = await import('../app/store.js');
  const cloud = { ...emptyState(plan), settings: { startDate: '2026-10-01', golfFrom: null, jumpKg: 2.5 } };
  assert.equal(mergeStates(emptyState(plan), cloud).settings.jumpKg, 2.5);
});

test('same day edited on both copies keeps ticks from both, newer wins on clashes', async () => {
  const { mergeStates, emptyState } = await import('../app/store.js');
  const cloud = { ...emptyState(plan), days: { '2026-10-06': { habits: { physio_am: true, app_cap: true }, asleep: '23:30', wake: '07:30', _t: 10 } } };
  const phone = { ...emptyState(plan), days: { '2026-10-06': { habits: { physio_pm: true, app_cap: false }, _t: 20 } } };
  const d = mergeStates(phone, cloud).days['2026-10-06'];
  assert.deepEqual(d.habits, { physio_am: true, app_cap: false, physio_pm: true });
  assert.equal(d.asleep, '23:30');
});
