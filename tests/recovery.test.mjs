import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA, compareVerdict, hm, recoveryView } from '../app/recovery-view.js';

// Made by garmin_recovery.snapshot.build, so these also check the two repos agree on the data shape.
const snaps = JSON.parse(readFileSync(new URL('./fixtures/recovery-snapshots.json', import.meta.url)));
const ctx = (recovery, today = snaps.full.date) => ({ cloud: { signedIn: true }, today, recovery });

test('fixtures match the schema this app understands', () => {
  assert.equal(snaps.full.v, SCHEMA);
  assert.equal(snaps.setup.v, SCHEMA);
});

test('full baseline shows the recovery score, drivers, comparison and trend', () => {
  const { title, sub, body } = recoveryView(ctx({ status: 'ok', snap: snaps.full }));
  assert.equal(title, 'Recovery');
  assert.match(sub, /Venu/);
  assert.match(body, new RegExp(`${snaps.full.recovery.score}%`));
  for (const part of ['What drove it', 'Last night', 'Lifting vs rest nights', 'Last 14 days', 'Lights out by']) assert.ok(body.includes(part), part);
  assert.ok(!body.includes('Setting up'));
  assert.ok(!body.includes('Last updated'));
});

test('setup mode counts nights and shows the streak', () => {
  const { body } = recoveryView(ctx({ status: 'ok', snap: snaps.setup }));
  assert.ok(body.includes('Setting up'));
  assert.ok(body.includes('3/7'));
  assert.ok(body.includes('3 night streak'));
  assert.ok(!body.includes('Lifting vs rest nights')); // tracker not linked in this fixture
});

test('an old snapshot says when it is from', () => {
  const { body } = recoveryView(ctx({ status: 'ok', snap: snaps.full }, '2026-12-01'));
  assert.match(body, /Last updated/);
});

test('signed out, loading, empty and error states', () => {
  assert.match(recoveryView({ cloud: { signedIn: false }, recovery: {} }).body, /Sign in under/);
  assert.match(recoveryView(ctx({ status: 'loading' })).body, /Loading/);
  assert.match(recoveryView(ctx({ status: 'none' })).body, /garmin-recovery daily/);
  assert.match(recoveryView(ctx({ status: 'error', error: 'Offline' })).body, /Offline/);
  assert.match(recoveryView(ctx({ status: 'error', error: 'Offline', snap: snaps.full })).body, /saved copy/);
});

test('a newer schema asks for a refresh instead of drawing garbage', () => {
  assert.match(recoveryView(ctx({ status: 'ok', snap: { ...snaps.full, v: SCHEMA + 1 } })).body, /newer version/);
});

test('text from the snapshot is escaped', () => {
  const { body } = recoveryView(ctx({ status: 'error', error: '<img src=x onerror=alert(1)>' }));
  assert.ok(!body.includes('<img'));
});

test('comparison verdict', () => {
  const base = { minNights: 4, lift: { nights: 5 }, rest: { nights: 6 } };
  assert.match(compareVerdict({ ...base, enough: false, lift: { nights: 1 }, rest: { nights: 2 } }), /Early days.*1 vs 2/);
  assert.match(compareVerdict({ ...base, enough: true, rechargeGap: 12 }), /12 less/);
  assert.match(compareVerdict({ ...base, enough: true, rechargeGap: -5 }), /5 more/);
  assert.match(compareVerdict({ ...base, enough: true, rechargeGap: 1 }), /isn't costing/);
});

test('hours format as h:mm', () => {
  assert.equal(hm(7.5), '7:30');
  assert.equal(hm(9.17), '9:10');
  assert.equal(hm(null), '-');
});

test('added exercise shows in Today with the stress before and after', () => {
  const { body } = recoveryView(ctx({ status: 'ok', snap: snaps.added }, snaps.added.date));
  assert.match(body, /Range session/);
  assert.match(body, />added</);
  assert.match(body, /Daytime stress <b class="num">30<\/b> \(50 before added exercise/);
});

test('snapshots from before the Today section still draw', () => {
  const { today, ...old } = snaps.full;
  assert.ok(!recoveryView(ctx({ status: 'ok', snap: old })).body.includes('<h2>Today</h2>'));
});
