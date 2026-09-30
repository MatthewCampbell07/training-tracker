import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../app/logic.js';
import { badges } from '../app/badges.js';

const plan = JSON.parse(readFileSync(new URL('../app/plan.json', import.meta.url)));
const settings = { startDate: '2026-10-05', golfFrom: null };
const empty = () => ({ version: 1, settings, days: {}, sessions: {} });
const goblet = plan.sessions.A.exercises.find((e) => e.id === 'goblet_squat');

test('week numbers run Monday to Sunday from the start date', () => {
  assert.equal(L.weekOf('2026-10-05', settings.startDate), 1);
  assert.equal(L.weekOf('2026-10-11', settings.startDate), 1);
  assert.equal(L.weekOf('2026-10-12', settings.startDate), 2);
  assert.equal(L.weekOf('2026-11-09', settings.startDate), 6);
  assert.equal(L.weekOf('2026-12-27', settings.startDate), 12);
  assert.equal(L.weekOf('2026-10-04', settings.startDate), 0);
});

test('week numbers ignore the clock change on 25 Oct', () => {
  assert.equal(L.weekOf('2026-10-25', settings.startDate), 3);
  assert.equal(L.weekOf('2026-10-26', settings.startDate), 4);
});

test('Monday A, Wednesday B, Friday C, nothing on rest days', () => {
  assert.equal(L.scheduledSession('2026-10-05', plan, settings), 'A');
  assert.equal(L.scheduledSession('2026-10-06', plan, settings), null);
  assert.equal(L.scheduledSession('2026-10-07', plan, settings), 'B');
  assert.equal(L.scheduledSession('2026-10-09', plan, settings), 'C');
  assert.equal(L.scheduledSession('2026-10-10', plan, settings), null);
});

test('week 12 Friday is the retest and nothing is scheduled after week 12', () => {
  assert.equal(L.scheduledSession('2026-12-25', plan, settings), 'R');
  assert.equal(L.scheduledSession('2026-12-28', plan, settings), null);
});

test('golf mode drops Friday from its start date only', () => {
  const golf = { ...settings, golfFrom: '2026-11-16' };
  assert.equal(L.scheduledSession('2026-11-13', plan, golf), 'C');
  assert.equal(L.scheduledSession('2026-11-20', plan, golf), null);
  assert.equal(L.scheduledSession('2026-11-18', plan, golf), 'B');
  assert.equal(L.sessionTarget(7, plan, golf), 2);
});

test('sets: 2 in week 1, 3 normally, 2 on deloads, 2 in golf mode', () => {
  assert.equal(L.setsFor(goblet, 1, plan, false), 2);
  assert.equal(L.setsFor(goblet, 3, plan, false), 3);
  assert.equal(L.setsFor(goblet, 6, plan, false), 2);
  assert.equal(L.setsFor(goblet, 12, plan, false), 2);
  assert.equal(L.setsFor(goblet, 8, plan, true), 2);
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
