// Today, Session and Settings screens. Each view returns { title, sub, nav, body } as HTML strings.
import {
  addDays, dayOfWeek, habitStreak, isDeload, isGolfMode, lastPerformance, parseIso, phaseFor,
  progressionCall, scheduledSession, sessionIsDone, setsFor, sleepHours, topWeight, upMessage, weekOf,
} from './logic.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseIso(iso).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function weekLabel(iso, plan, settings) {
  const w = weekOf(iso, settings.startDate);
  if (w < 1) return `Plan starts ${fmtDate(settings.startDate)}`;
  if (w > plan.weeks) return 'Plan finished';
  const phase = phaseFor(w, plan);
  return `Week ${w} of ${plan.weeks}, ${phase ? phase.name : ''}${isGolfMode(iso, settings) ? ', golf mode' : ''}`;
}

function streakText(n) {
  return n ? `<span class="streak">${n} day${n === 1 ? '' : 's'}</span>` : '<span class="streak zero">0</span>';
}

export function habitRow(habit, pressed, streakNow) {
  return `<button class="habit" data-habit="${habit.id}" aria-pressed="${pressed}">
    <span class="tick" aria-hidden="true"></span>
    <span class="label">${esc(habit.label)}${habit.hint ? `<span class="hint">${esc(habit.hint)}</span>` : ''}</span>
    ${streakText(streakNow)}
  </button>`;
}

export function todayView({ plan, state, date, today }) {
  const s = state.settings;
  const day = state.days[date] || {};
  const week = weekOf(date, s.startDate);
  const letter = state.sessions[date]?.letter || scheduledSession(date, plan, s);
  const target = plan.wakeTargets[String(dayOfWeek(date))];
  const hours = sleepHours(day.asleep, day.wake);
  const isToday = date === today;
  const rows = (when) => plan.habits.filter((h) => h.when === when)
    .map((h) => habitRow(h, Boolean(day.habits?.[h.id]), habitStreak(state, h.id, today, s.startDate).current)).join('');
  const doneCount = plan.habits.filter((h) => day.habits?.[h.id]).length;
  const weighDay = plan.calendar.weighInDays.includes(dayOfWeek(date));

  let banner = '';
  if (isDeload(week, plan)) banner = `<div class="banner">Deload week: half the sets, same weights.</div>`;
  if (week === plan.retestWeek && dayOfWeek(date) === 5) banner = `<div class="banner">Retest day. Max push ups, goblet squat reps, single arm row reps.</div>`;
  if (week === 2 && dayOfWeek(date) === 1) banner += `<div class="banner blue">This week: show the plan to your physio before week 3.</div>`;

  let lift = '';
  if (letter) {
    const title = plan.sessions[letter].title;
    const done = sessionIsDone(state.sessions[date]);
    lift = `<button class="lift${done ? ' done' : ''}" data-action="open-session" style="border:0;width:100%;text-align:left;cursor:pointer">
      <span class="letter">${letter}</span>
      <span class="meta"><b>${done ? 'Session done' : `Session ${letter} today`}</b><span>${esc(title)}</span></span>
      <span aria-hidden="true" style="font-size:22px">›</span>
    </button>`;
  }

  const body = `${banner}
    <section class="card" aria-labelledby="checkin-h">
      <h2 id="checkin-h">Morning check-in</h2>
      <div class="field-row">
        <label class="field">Fell asleep<input type="time" data-field="asleep" value="${esc(day.asleep)}"></label>
        <label class="field">Woke up<input type="time" data-field="wake" value="${esc(day.wake)}"></label>
        <label class="field">Weight kg${weighDay ? ' ●' : ''}<input type="text" inputmode="decimal" data-field="weight" placeholder="${weighDay ? 'weigh in' : 'optional'}" value="${esc(day.weight)}"></label>
      </div>
      <p class="sleep-note">${hours !== null ? `<b class="num">${hours.toFixed(1)} h</b> asleep. ` : ''}Wake target ${target}.</p>
      ${rows('morning')}
    </section>
    ${lift}
    <section class="card" aria-labelledby="physio-h">
      <h2 id="physio-h">Physio</h2>
      ${rows('day')}
    </section>
    <p class="fine" style="text-align:center"><span class="num">${doneCount} of ${plan.habits.length}</span> done ${isToday ? 'today' : 'this day'}${isToday ? '' : `. <button class="small-btn" data-action="go-today">Back to today</button>`}</p>`;

  return {
    title: isToday ? 'Today' : fmtDate(date),
    sub: `${isToday ? `${fmtDate(date)}. ` : ''}${weekLabel(date, plan, s)}`,
    nav: ['day-prev', 'day-next'],
    body,
  };
}

function lastLine(last, ex, maxKg) {
  if (!last) return '<div class="last">First time. Start light.</div>';
  const reps = last.sets.map((x) => x.r).join(', ');
  const w = topWeight(last.sets);
  const unit = ex.unit === 'sec' ? ' sec' : '';
  const up = progressionCall(ex, last.sets, last.sets.length) === 'up' ? ` <b>Top of range last time. ${esc(upMessage(ex, w, maxKg).replace(' next time', ' today'))}.</b>` : '';
  return `<div class="last">Last time, ${fmtDate(last.date)}: ${w !== null ? `${w} kg x ` : ''}${reps}${unit}.${up}</div>`;
}

export function callHtml(ex, sets, required, maxKg) {
  const call = progressionCall(ex, sets, required);
  if (call === 'up') return `<span class="call up">${esc(upMessage(ex, topWeight(sets), maxKg))}</span>`;
  if (call === 'hold') return `<span class="call hold">Same weight next time, beat the reps</span>`;
  return '';
}

function exerciseCard(ex, ctx, week, golf) {
  const { state, date } = ctx;
  const session = state.sessions[date] || {};
  const sets = session.sets?.[ex.id] || [];
  const required = setsFor(ex, week, ctx.plan, golf);
  const extra = ctx.extraSets[ex.id] || 0;
  const rowsCount = Math.max(required + extra, sets.length);
  const last = lastPerformance(state, ex.id, date);
  const lastW = last ? topWeight(last.sets) : null;
  const range = ex.max === null ? 'max effort' : ex.min === ex.max ? `${ex.max}` : `${ex.min}-${ex.max}`;
  const unit = ex.unit === 'sec' ? ' sec' : '';
  const wPh = ex.load === 'bw' ? 'body' : ex.load === 'band' ? 'band' : lastW ?? 'kg';
  let rows = '';
  for (let i = 0; i < rowsCount; i += 1) {
    const set = sets[i] || {};
    rows += `<div class="set-row">
      <span class="n">${i + 1}</span>
      <input type="text" inputmode="decimal" aria-label="${esc(ex.name)} set ${i + 1} weight kg" placeholder="${esc(wPh)}" data-ex="${ex.id}" data-i="${i}" data-f="w" value="${esc(set.w)}">
      <input type="text" inputmode="numeric" aria-label="${esc(ex.name)} set ${i + 1} ${ex.unit}" placeholder="${ex.unit === 'sec' ? 'sec' : 'reps'}" data-ex="${ex.id}" data-i="${i}" data-f="r" value="${esc(set.r)}">
    </div>`;
  }
  const reserve = ex.load === 'db' && ex.max !== null
    ? `<label class="toggle"><input type="checkbox" data-reserve="${ex.id}" ${session.reserve?.[ex.id] ? 'checked' : ''}>2+ reps left</label>` : '';
  return `<section class="card ex" id="ex-${ex.id}">
    <h3>${esc(ex.name)}</h3>
    <div class="sub num">${required} x ${range}${unit}${ex.each ? ' each side' : ''}, rest ${esc(ex.rest)}</div>
    <div class="cue">${esc(ex.cue)}</div>
    ${lastLine(last, ex, ctx.plan.maxDumbbellKg)}
    ${rows}
    <div class="ex-foot">
      <span id="call-${ex.id}">${callHtml(ex, sets, required, ctx.plan.maxDumbbellKg)}</span>
      ${reserve}
      <button class="small-btn" data-action="add-set" data-ex="${ex.id}">+ set</button>
    </div>
  </section>`;
}

export function sessionLetterFor(ctx) {
  const { plan, state, date } = ctx;
  return state.sessions[date]?.letter || ctx.pickedLetter || scheduledSession(date, plan, state.settings) || 'A';
}

export function sessionView(ctx) {
  const { plan, state, date } = ctx;
  const s = state.settings;
  const week = Math.min(Math.max(weekOf(date, s.startDate), 1), plan.weeks);
  const golf = isGolfMode(date, s);
  const letter = sessionLetterFor(ctx);
  const session = plan.sessions[letter];
  const done = sessionIsDone(state.sessions[date]) && state.sessions[date]?.done;
  const letters = week === plan.retestWeek || letter === 'R' ? ['A', 'B', 'C', 'R'] : ['A', 'B', 'C'];
  const phase = phaseFor(week, plan);

  const chips = letters.map((l) => `<button class="chip" data-letter="${l}" aria-pressed="${l === letter}">${l}</button>`).join('');
  const warm = session.retest ? '' : `<details class="card warm"><summary>Warm up, 8 to 10 min</summary><ol>${plan.warmup.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></details>`;
  const cards = session.exercises.map((ex) => exerciseCard(ex, ctx, week, golf)).join('');
  const finish = done
    ? `<button class="btn ghost block" data-action="unfinish">Session done. Tap to undo</button>`
    : `<button class="btn red block" data-action="finish">Finish session ${letter}</button>`;

  return {
    title: `Session ${letter}`,
    sub: `${fmtDate(date)}. ${esc(session.title)}`,
    nav: ['day-prev', 'day-next'],
    body: `<div class="chips" role="group" aria-label="Choose session">${chips}</div>
      ${phase ? `<div class="banner ${isDeload(week, plan) ? '' : 'blue'}">${esc(phase.name)}: ${esc(phase.note)}${golf ? ' Golf mode: 2 sets.' : ''}</div>` : ''}
      ${warm}${cards}${finish}`,
  };
}

function nextMonday(today) {
  const dow = dayOfWeek(today);
  return addDays(today, ((8 - dow) % 7) || 7);
}

export function settingsView({ plan, state, today }) {
  const s = state.settings;
  const golf = s.golfFrom
    ? `<div class="settings-row"><span>Golf mode on from <b>${fmtDate(s.golfFrom)}</b>. Sessions A and B, 2 sets each.</span><button class="btn ghost" data-action="golf-off">Turn off</button></div>`
    : `<div class="settings-row"><label class="field" style="flex:1">Switch to 2 sessions a week from<input type="date" id="golf-date" value="${nextMonday(today)}"></label><button class="btn" data-action="golf-on">Turn on</button></div>`;
  return {
    title: 'Settings',
    sub: 'Everything is saved on this phone only',
    nav: [],
    body: `<section class="card"><h2>Plan</h2>
        <div class="settings-row"><span>Week 1 starts (a Monday)</span><input type="date" data-setting="startDate" value="${esc(s.startDate)}"></div>
        ${golf}
      </section>
      <section class="card"><h2>Backup</h2>
        <p class="fine">Save a backup every Sunday at your weekly review. Put it in iCloud Drive.</p>
        <div class="btn-row">
          <button class="btn" data-action="export-json">Save backup</button>
          <button class="btn ghost" data-action="export-csv">CSV for R or Python</button>
          <label class="btn ghost">Restore<input type="file" accept="application/json,.json" data-action="import" hidden></label>
        </div>
      </section>
      <section class="card"><h2>Screen Time setup, 2 minutes</h2>
        <ol class="list-plain">
          <li>Settings, Screen Time, App Limits, Add Limit. Pick Instagram and TikTok, set 30 min.</li>
          <li>Screen Time, Downtime, Scheduled: 22:30 to 06:15.</li>
          <li>To switch either off for a day, tap Ignore Limit when it appears.</li>
        </ol>
      </section>
      <section class="card"><h2>Where the habits come from</h2>
        <ol class="list-plain fine">
          <li>7+ hours: Watson et al. 2015, <i>Sleep</i>. AASM and SRS consensus. Strong.</li>
          <li>Regular wake time: Windred et al. 2024, <i>Sleep</i>. UK Biobank, observational.</li>
          <li>Phone away at night: Exelmans and Van den Bulck 2016, <i>Soc Sci Med</i> (survey), and stimulus control from CBT for insomnia, Edinger et al. 2021, <i>JCSM</i>. The phone step itself is an extrapolation.</li>
          <li>30 min social media: Hunt et al. 2018, <i>J Soc Clin Psychol</i>. Small student trial.</li>
          <li>Screen light before bed: Chang et al. 2015, <i>PNAS</i>. About 10 min later sleep, lab study of 12 people.</li>
        </ol>
        <p class="fine">Not medical advice. See your GP if you often take over 30 min to fall asleep, wake and cannot get back to sleep, snore loudly or gasp, or feel very sleepy in the day after 7+ hours.</p>
      </section>
      <section class="card"><h2>Danger zone</h2>
        <button class="btn red" data-action="reset">Delete all data on this phone</button>
      </section>`,
  };
}
