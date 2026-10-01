// Week and Stats screens.
import {
  addDays, exerciseHistory, gymStatus, groupStreak, habitDone, habitStreak, isDeload, phaseFor,
  progressionCall, scheduledSession, sessionIsDone, sessionTarget, sessionWeekStreak, sessionsDoneInWeek,
  recentPain, setsFor, topWeight, upMessage, weekAdherence, weekAverages, weekOf, weekStart, isGolfMode, dayOfWeek,
} from './logic.js';
import { badges } from './badges.js';
import { heatmap, lineChart, weekBars } from './charts.js';
import { esc, fmtDate } from './views.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index = dayOfWeek

function shortLabel(label) {
  const s = label.replace(/^(Last night|Yesterday): /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function allExercises(plan) {
  const seen = new Map();
  for (const letter of ['A', 'B', 'C']) for (const ex of plan.sessions[letter].exercises) seen.set(ex.id, ex);
  return [...seen.values()];
}

function nextTimeCalls(state, plan, today) {
  return allExercises(plan).flatMap((ex) => {
    const hist = exerciseHistory(state, ex.id).filter((h) => h.session.letter !== 'R');
    const last = hist[hist.length - 1];
    if (!last || last.session.pain?.[ex.id]) return [];
    const week = Math.max(1, weekOf(last.date, state.settings.startDate));
    const required = setsFor(ex, week, plan, isGolfMode(last.date, state.settings));
    return progressionCall(ex, last.sets, required) === 'up' ? [{ ex, msg: upMessage(ex, topWeight(last.sets), plan.maxDumbbellKg) }] : [];
  });
}

function weightLine(cur, prev) {
  if (cur.weight === null) return '<p class="empty">No weigh ins this week yet.</p>';
  let out = `<p><b class="num">${cur.weight.toFixed(1)} kg</b> average from ${cur.weightCount} weigh in${cur.weightCount === 1 ? '' : 's'}.`;
  if (prev.weight !== null) {
    const pct = ((cur.weight - prev.weight) / prev.weight) * 100;
    const inRange = pct >= 0.25 && pct <= 0.5;
    const cls = inRange ? 'good' : 'warn';
    const note = inRange ? 'On target (0.25 to 0.5% a week).'
      : pct < 0.25 ? 'Below 0.25% a week. If this lasts 2 to 3 weeks, add about 200 kcal a day.'
        : 'Above 0.5% a week. Fine for a week or two, watch the trend.';
    out += ` <span class="${cls} num">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span> on last week. ${note}`;
  }
  return `${out}</p>`;
}

export function weekView(ctx) {
  const { plan, state, today } = ctx;
  const s = state.settings;
  const week = ctx.weekShown;
  const start = weekStart(week, s.startDate);
  const phase = phaseFor(week, plan);
  const done = sessionsDoneInWeek(state, week, s);
  const target = sessionTarget(week, plan, s);
  const cur = weekAverages(state, week, s);
  const prev = weekAverages(state, week - 1, s);

  const sessionPills = [...Array(7).keys()].map((i) => {
    const d = addDays(start, i);
    const letter = scheduledSession(d, plan, s);
    if (!letter) return '';
    const ok = sessionIsDone(state.sessions[d]);
    return `<li><b>${DOW[dayOfWeek(d)]}</b> ${letter === 'R' ? 'Retest' : `Session ${letter}`} <span class="${ok ? 'good' : 'fine'}">${ok ? 'done' : d < today ? 'missed' : 'to do'}</span></li>`;
  }).join('');

  const head = `<tr><th></th>${[...Array(7).keys()].map((i) => `<th>${DOW[dayOfWeek(addDays(start, i))][0]}</th>`).join('')}</tr>`;
  const grid = plan.habits.map((h) => `<tr><td>${esc(shortLabel(h.label))}</td>${[...Array(7).keys()].map((i) => {
    const d = addDays(start, i);
    return `<td><span class="dot${habitDone(state, d, h.id) ? ' on' : ''}" data-goto="${d}" role="button" aria-label="${esc(h.label)} ${d}"></span></td>`;
  }).join('')}</tr>`).join('');

  const calls = nextTimeCalls(state, plan, today);
  const gym = gymStatus(state, plan);
  const names = Object.fromEntries(allExercises(plan).map((e) => [e.id, e.name]));
  const pain = recentPain(state, today);
  const painCard = pain.length ? `<section class="card"><h2>Pain flags, last 14 days</h2><ul class="list-plain">${pain.map((p) => `<li><b>${esc(names[p.exId] || p.exId)}</b>, ${fmtDate(p.date)}</li>`).join('')}</ul>
      <p class="fine">Keep the weight the same or lighter on these. If the pain is sharp, builds with each rep, or lasts into the next day, drop that exercise and see your GP if it keeps coming back.</p></section>` : '';

  return {
    title: `Week ${week}`,
    sub: `${fmtDate(start)} to ${fmtDate(addDays(start, 6))}. ${phase ? phase.name : ''}`,
    nav: ['week-prev', 'week-next'],
    body: `${isDeload(week, plan) ? '<div class="banner">Deload week: half the sets, same weights.</div>' : ''}
      <div class="hero">
        <div class="stat ${done >= target && target ? 'red' : ''}"><b>${done}/${target}</b><span>sessions</span></div>
        <div class="stat"><b>${cur.sleep !== null ? cur.sleep.toFixed(1) : '-'}</b><span>avg hours sleep</span></div>
        <div class="stat"><b>${(() => { const a = weekAdherence(state, week, plan, s, today); return a === null ? '-' : `${Math.round(a * 100)}%`; })()}</b><span>habits ticked</span></div>
      </div>
      ${painCard}
      <section class="card"><h2>Sessions</h2><ul class="list-plain">${sessionPills || '<li>No sessions this week.</li>'}</ul></section>
      <section class="card"><h2>Habits</h2><table class="week-grid">${head}${grid}</table></section>
      <section class="card"><h2>Weigh in</h2>${weightLine(cur, prev)}</section>
      <section class="card"><h2>Add load next time</h2>${calls.length ? `<ul class="list-plain">${calls.map((c) => `<li><b>${esc(c.ex.name)}</b>: ${esc(c.msg)}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet. Hit the top of the range on every set to earn a jump.</p>'}</section>
      <section class="card"><h2>Gym check</h2><ul class="list-plain">${gym.map((g) => `<li><span class="${g.ready ? 'good' : 'fine'}">${g.ready ? 'Ready' : 'Not yet'}</span> <b>${esc(g.name)}</b>. ${esc(g.detail)}</li>`).join('')}</ul>
        <p class="fine">Ready means 20 kg for 12 reps on every set with 2+ reps left. When both are ready, move leg work to a gym.</p>
        ${plan.gymLater?.length ? `<p class="fine"><b>Add at the gym:</b> ${plan.gymLater.map((g) => esc(g.name)).join(', ')}.</p>` : ''}</section>`,
  };
}

export function statsView(ctx) {
  const { plan, state, today } = ctx;
  const s = state.settings;
  const lastDay = today < addDays(s.startDate, plan.weeks * 7 - 1) ? today : addDays(s.startDate, plan.weeks * 7 - 1);
  let scheduled = 0;
  for (let d = s.startDate; d <= lastDay; d = addDays(d, 1)) if (scheduledSession(d, plan, s)) scheduled += 1;
  const sessionsDone = Object.values(state.sessions).filter(sessionIsDone).length;

  let ticks = 0;
  let possible = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(today, -i);
    if (d < s.startDate) break;
    ticks += plan.habits.filter((h) => habitDone(state, d, h.id)).length;
    possible += plan.habits.length;
  }
  const streaks = plan.habits.map((h) => ({ label: shortLabel(h.label), ...habitStreak(state, h.id, today, s.startDate) }));
  const groups = [['Both physio blocks', 'physio'], ['All sleep habits', 'sleep']].map(([label, g]) => ({ label, ...groupStreak(state, plan, g, today, s.startDate) }));
  const weekStreak = sessionWeekStreak(state, plan, s, today);
  const bestNow = Math.max(0, ...streaks.map((x) => x.current));

  const curWeek = Math.min(Math.max(weekOf(today, s.startDate), 1), plan.weeks);
  const adherence = [...Array(plan.weeks).keys()].map((i) => (i + 1 <= weekOf(today, s.startDate) ? weekAdherence(state, i + 1, plan, s, today) : null));

  const exById = Object.fromEntries(allExercises(plan).map((e) => [e.id, e]));
  const lifts = plan.keyLifts.map((id) => {
    const pts = exerciseHistory(state, id).filter((h) => h.session.letter !== 'R')
      .map((h) => ({ x: h.date, y: topWeight(h.sets) ?? 0, note: `reps ${h.sets.map((z) => z.r).join(', ')}` }));
    const now = pts.length ? `${pts[pts.length - 1].y} kg` : '';
    return `<div><h4>${esc(exById[id].name)}</h4><span class="now">${now}</span>${lineChart(pts, { ref: plan.maxDumbbellKg, unit: ' kg', height: 80 })}</div>`;
  }).join('');

  const weeks = [...Array(plan.weeks).keys()].map((i) => ({ w: i + 1, ...weekAverages(state, i + 1, s) }));
  const bw = weeks.filter((x) => x.weight !== null).map((x) => ({ x: weekStart(x.w, s.startDate), y: Number(x.weight.toFixed(1)), note: `week ${x.w}` }));
  const sl = weeks.filter((x) => x.sleep !== null).map((x) => ({ x: weekStart(x.w, s.startDate), y: Number(x.sleep.toFixed(1)), note: `week ${x.w}` }));

  const list = badges(state, plan, today);
  const earned = list.filter((b) => b.earned).length;
  const badgeHtml = [...list].sort((a, b) => Number(b.earned) - Number(a.earned)).map((b) => `<div class="badge${b.earned ? ' earned' : ''}" title="${esc(b.desc)}">
      <div class="medal" aria-hidden="true">${esc(b.icon)}</div>${esc(b.title)}
      ${b.earned ? '' : `<span class="prog">${b.cur}/${b.target}</span>`}</div>`).join('');

  return {
    title: 'Stats',
    sub: `${earned} of ${list.length} badges earned`,
    nav: [],
    body: `<div class="hero">
        <div class="stat"><b>${sessionsDone}</b><span>of ${scheduled} sessions so far</span></div>
        <div class="stat red"><b>${bestNow}</b><span>day best current streak</span></div>
        <div class="stat"><b>${possible ? Math.round((ticks / possible) * 100) : 0}%</b><span>habits, last 7 days</span></div>
      </div>
      <section class="card"><h2>Badges</h2><div class="badges">${badgeHtml}</div></section>
      <section class="card"><h2>Streaks</h2><table class="streak-table">
        <tr><th>Habit</th><th>Now</th><th>Best</th></tr>
        ${[...groups, ...streaks].map((x) => `<tr><td>${esc(x.label)}</td><td class="n">${x.current}</td><td class="n">${x.best}</td></tr>`).join('')}
        <tr><td>Full weeks of sessions</td><td class="n">${weekStreak.current}</td><td class="n">${weekStreak.best}</td></tr>
      </table></section>
      <section class="card"><h2>All 12 weeks</h2>${heatmap(state, plan, s, today)}
        <div class="legend"><span><i style="background:var(--blue)"></i>habits ticked</span><span><i style="background:var(--red);border-radius:50%"></i>session done</span><span><i style="border:1.5px solid var(--red);border-radius:50%"></i>session planned</span><span style="color:var(--red)">red week = deload</span></div>
      </section>
      <section class="card"><h2>Habits by week</h2>${weekBars(adherence, curWeek, plan)}<p class="fine">Dashed line is 80%.</p></section>
      <section class="card"><h2>Key lifts, top set kg</h2><div class="lifts">${lifts}</div><p class="fine">Dashed line is your 20 kg dumbbell limit.</p></section>
      <section class="card"><h2>Body weight, weekly average</h2>${lineChart(bw, { unit: ' kg' })}</section>
      <section class="card"><h2>Sleep, weekly average hours</h2>${lineChart(sl, { ref: 7, unit: ' h' })}</section>`,
  };
}
