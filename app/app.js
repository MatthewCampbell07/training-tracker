// Wiring: load data, render the current tab, handle taps and inputs.
import { badges } from './badges.js';
import { addDays, dayOfWeek, localTodayIso, weekOf, isGolfMode, setsFor } from './logic.js';
import * as store from './store.js';
import { callHtml, sessionLetterFor, sessionView, settingsView, todayView } from './views.js';
import { statsView, weekView } from './stats-views.js';

const plan = await fetch('plan.json').then((r) => r.json());
let state = store.load(plan);
const today = () => localTodayIso();
let ui = { tab: 'today', date: today(), openedOn: today(), weekShown: 1, pickedLetter: null, extraSets: {} };
let earnedBadges = new Set(badges(state, plan, today()).filter((b) => b.earned).map((b) => b.id));

const VIEWS = { today: todayView, session: sessionView, week: weekView, stats: statsView, settings: settingsView };
const $ = (sel) => document.querySelector(sel);

function clampWeek(w) {
  return Math.min(Math.max(w, 1), plan.weeks);
}

function render() {
  const ctx = { plan, state, today: today(), ...ui };
  const view = VIEWS[ui.tab](ctx);
  $('#title').textContent = view.title;
  $('#sub').textContent = view.sub;
  $('#prev').hidden = view.nav.length === 0;
  $('#next').hidden = view.nav.length === 0;
  $('#prev').dataset.action = view.nav[0] || '';
  $('#next').dataset.action = view.nav[1] || '';
  $('#view').innerHTML = view.body;
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function commit(next, { rerender = true } = {}) {
  state = next;
  if (!store.save(state)) toast('Could not save. Is storage full?');
  checkBadges();
  if (rerender) render();
}

function checkBadges() {
  const now = badges(state, plan, today()).filter((b) => b.earned);
  const fresh = now.filter((b) => !earnedBadges.has(b.id));
  earnedBadges = new Set(now.map((b) => b.id));
  if (fresh.length) {
    toast(`Badge earned: ${fresh.map((b) => b.title).join(', ')}`);
    confetti();
  }
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colours = ['#d62839', '#ffffff', '#2456c8', '#13294b'];
  for (let i = 0; i < 60; i += 1) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colours[i % colours.length];
    p.style.boxShadow = '0 0 0 1px rgb(0 0 0 / 8%)';
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
    p.style.setProperty('--rot', `${Math.random() * 720}deg`);
    p.style.animationDelay = `${Math.random() * 0.3}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2000);
}

function goTab(tab) {
  ui = { ...ui, tab };
  if (tab === 'week') ui = { ...ui, weekShown: clampWeek(weekOf(ui.date, state.settings.startDate)) };
  render();
  window.scrollTo(0, 0);
}

function shareOrDownload(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).catch((err) => {
      if (err.name !== 'AbortError') toast('Could not share the file');
    });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return Promise.resolve();
}

const ACTIONS = {
  'day-prev': () => { ui = { ...ui, date: addDays(ui.date, -1), pickedLetter: null, extraSets: {} }; render(); },
  'day-next': () => { ui = { ...ui, date: addDays(ui.date, 1), pickedLetter: null, extraSets: {} }; render(); },
  'week-prev': () => { ui = { ...ui, weekShown: clampWeek(ui.weekShown - 1) }; render(); },
  'week-next': () => { ui = { ...ui, weekShown: clampWeek(ui.weekShown + 1) }; render(); },
  'go-today': () => { ui = { ...ui, date: today() }; render(); },
  'open-session': () => goTab('session'),
  'add-set': (el) => { ui = { ...ui, extraSets: { ...ui.extraSets, [el.dataset.ex]: (ui.extraSets[el.dataset.ex] || 0) + 1 } }; render(); },
  finish: () => {
    const letter = sessionLetterFor({ plan, state, ...ui });
    commit(store.updateSession(state, ui.date, { letter, done: true, retest: letter === 'R' }));
    confetti();
    toast(`Session ${letter} done. Nice work.`);
  },
  unfinish: () => commit(store.updateSession(state, ui.date, { done: false })),
  'golf-on': () => {
    const from = $('#golf-date').value;
    if (!from) return toast('Pick a start date first');
    commit(store.updateSettings(state, { golfFrom: from }));
    toast('Golf mode on. Rebuild the calendar too, see the README.');
  },
  'golf-off': () => commit(store.updateSettings(state, { golfFrom: null })),
  'export-json': () => shareOrDownload(`training-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'),
  'export-csv': async () => {
    await shareOrDownload(`training-sets-${today()}.csv`, store.setsCsv(state), 'text/csv');
    await shareOrDownload(`training-days-${today()}.csv`, store.daysCsv(state, plan), 'text/csv');
  },
  reset: () => {
    if (!confirm('Delete every tick, weight and session on this phone? Save a backup first if unsure.')) return;
    commit(store.emptyState(plan));
    toast('All data deleted');
  },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return goTab(tab.dataset.tab);
  const habit = e.target.closest('[data-habit]');
  if (habit) {
    const next = store.toggleHabit(state, ui.date, habit.dataset.habit);
    if (navigator.vibrate) navigator.vibrate(10);
    return commit(next);
  }
  const letter = e.target.closest('[data-letter]');
  if (letter) {
    ui = { ...ui, pickedLetter: letter.dataset.letter, extraSets: {} };
    if (state.sessions[ui.date]) return commit(store.updateSession(state, ui.date, { letter: letter.dataset.letter, retest: letter.dataset.letter === 'R' }));
    return render();
  }
  const go = e.target.closest('[data-goto]');
  if (go) { ui = { ...ui, date: go.dataset.goto }; return goTab('today'); }
  const act = e.target.closest('[data-action]');
  if (act && act.tagName !== 'INPUT' && ACTIONS[act.dataset.action]) return ACTIONS[act.dataset.action](act);
  return undefined;
});

function parseNum(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.field) {
    const field = el.dataset.field;
    const value = field === 'weight' ? parseNum(el.value) : el.value || undefined;
    let next = store.updateDay(state, ui.date, { [field]: value });
    if (field === 'wake' && value) {
      const onTime = value <= plan.wakeTargets[String(dayOfWeek(ui.date))];
      const day = next.days[ui.date];
      next = store.updateDay(next, ui.date, { habits: { ...(day.habits || {}), wake: onTime } });
    }
    return commit(next);
  }
  if (el.dataset.ex) {
    const letter = sessionLetterFor({ plan, state, ...ui });
    let next = store.setSetValue(state, ui.date, el.dataset.ex, Number(el.dataset.i), el.dataset.f, parseNum(el.value));
    next = store.updateSession(next, ui.date, { letter, retest: letter === 'R' });
    // Keep focus in the next box: update only the progression call, not the whole screen.
    commit(next, { rerender: false });
    const ex = plan.sessions[letter].exercises.find((x) => x.id === el.dataset.ex);
    const week = Math.min(Math.max(weekOf(ui.date, state.settings.startDate), 1), plan.weeks);
    const required = setsFor(ex, week, plan, isGolfMode(ui.date, state.settings));
    const slot = document.getElementById(`call-${ex.id}`);
    if (slot) slot.innerHTML = callHtml(ex, next.sessions[ui.date].sets[ex.id], required, plan.maxDumbbellKg, Boolean(next.sessions[ui.date].pain?.[ex.id]));
    return undefined;
  }
  if (el.dataset.pain) {
    const s = state.sessions[ui.date] || {};
    return commit(store.updateSession(state, ui.date, { letter: sessionLetterFor({ plan, state, ...ui }), pain: { ...(s.pain || {}), [el.dataset.pain]: el.checked } }));
  }
  if (el.dataset.reserve) {
    const s = state.sessions[ui.date] || {};
    return commit(store.updateSession(state, ui.date, { reserve: { ...(s.reserve || {}), [el.dataset.reserve]: el.checked } }), { rerender: false });
  }
  if (el.dataset.setting === 'startDate') {
    if (!el.value) return undefined;
    if (dayOfWeek(el.value) !== 1) toast('Tip: week 1 works best starting on a Monday');
    return commit(store.updateSettings(state, { startDate: el.value }));
  }
  if (el.dataset.action === 'import' && el.files?.[0]) {
    try {
      const data = store.validate(JSON.parse(await el.files[0].text()), plan);
      if (!confirm('Replace everything on this phone with this backup?')) return undefined;
      commit(data);
      toast('Backup restored');
    } catch (err) {
      toast(`Could not restore: ${err.message}`);
    }
  }
  return undefined;
});

// Roll over to the new day if the app was left open overnight.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.openedOn !== today()) {
    ui = { ...ui, date: today(), openedOn: today() };
    render();
  }
});

store.requestPersistence();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.error('Offline mode not available', err));
}
render();
