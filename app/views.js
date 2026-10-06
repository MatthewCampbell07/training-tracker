// Today, Session and Settings screens. Each view returns { title, sub, nav, body } as HTML strings.
import {
  addDays, dayOfWeek, habitStreak, isDeload, isGolfMode, lastPerformance, parseIso, phaseFor,
  progressionCall, scheduledSession, sessionIsDone, setsFor, sleepHours, suggestFor, topWeight, upMessage, weekOf,
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

// Default sleep times: your last logged value, else the plan's usual times for that weekday.
export function sleepDefaults(plan, state, date) {
  const before = Object.keys(state.days).filter((d) => d < date).sort().reverse();
  const lastAsleep = before.map((d) => state.days[d].asleep).find(Boolean);
  const sameDay = before.filter((d) => dayOfWeek(d) === dayOfWeek(date)).map((d) => state.days[d].wake).find(Boolean);
  return { asleep: lastAsleep || '23:15', wake: sameDay || plan.wakeDefaults[String(dayOfWeek(date))] };
}

function stepper(field, label, value, logged) {
  return `<div class="stepper${logged ? ' logged' : ''}"><span class="lbl">${label}</span>
    <button class="step" data-action="t-step" data-field="${field}" data-d="-15" aria-label="${label} 15 minutes earlier">−</button>
    <b class="num">${value}</b>
    <button class="step" data-action="t-step" data-field="${field}" data-d="15" aria-label="${label} 15 minutes later">+</button></div>`;
}

export function todayView({ plan, state, date, today }) {
  const s = state.settings;
  const day = state.days[date] || {};
  const week = weekOf(date, s.startDate);
  const letter = state.sessions[date]?.letter || scheduledSession(date, plan, s);
  const hours = sleepHours(day.asleep, day.wake);
  const logged = hours !== null;
  const defaults = sleepDefaults(plan, state, date);
  const defaultHours = sleepHours(day.asleep || defaults.asleep, day.wake || defaults.wake) ?? 0;
  const isToday = date === today;
  const rows = (when) => plan.habits.filter((h) => h.when === when)
    .map((h) => habitRow(h, Boolean(day.habits?.[h.id]), habitStreak(state, h.id, today, s.startDate).current)).join('');
  const doneCount = plan.habits.filter((h) => day.habits?.[h.id]).length;
  const weighDay = plan.calendar.weighInDays.includes(dayOfWeek(date));

  let banner = '';
  if (isDeload(week, plan)) banner = `<div class="banner">Deload week: half the sets, same weights.</div>`;
  if (scheduledSession(date, plan, s) === 'R') banner = `<div class="banner">Retest day. Max push ups, goblet squat reps, single arm row reps.</div>`;

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
      ${stepper('asleep', 'Fell asleep', day.asleep || defaults.asleep, logged)}
      ${stepper('wake', 'Woke up', day.wake || defaults.wake, logged)}
      <p class="sleep-note">${logged ? `<b class="num">${hours.toFixed(1)} h</b> asleep. Use − and + to adjust.` : `<button class="btn red" data-action="log-sleep">Log ${defaultHours.toFixed(1)} h sleep</button> Adjust first with − and + if needed.`}</p>
      <label class="field weight-field">Weight kg${weighDay ? ', weigh-in day' : ''}<input type="text" inputmode="decimal" data-field="weight" placeholder="${weighDay ? 'weigh in' : 'optional'}" value="${esc(day.weight)}"></label>
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

const YOUTUBE = 'https://www.youtube.com/results?search_query=';

// Written steps plus a YouTube search. Physio exercises have no video: the physio sheet photos are the reference.
export function howToHtml(plan, key, label = 'How to do it') {
  const how = plan.howTo[key];
  if (!how) return '';
  const video = how.video
    ? `<a class="btn ghost video" href="${YOUTUBE}${encodeURIComponent(how.video)}" target="_blank" rel="noopener">Watch videos on YouTube</a>`
    : '<p class="fine">No video for this one. It is your physio\'s version, so use the photo on your sheet.</p>';
  return `<details class="how"><summary>${esc(label)}</summary><ol>${how.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${video}</details>`;
}

function lastLine(last, ex, maxKg) {
  if (!last) return '<div class="last">First time. Start light.</div>';
  const reps = last.sets.map((x) => x.r).join(', ');
  const w = topWeight(last.sets);
  const unit = ex.unit === 'sec' ? ' sec' : '';
  const up = !last.session.pain?.[ex.id] && progressionCall(ex, last.sets, last.sets.length) === 'up' ? ` <b>Top of range last time. ${esc(upMessage(ex, w, maxKg).replace(' next time', ' today'))}.</b>` : '';
  return `<div class="last">Last time, ${fmtDate(last.date)}: ${w !== null ? `${w} kg x ` : ''}${reps}${unit}.${up}</div>`;
}

export function callHtml(ex, sets, required, maxKg, pain = false) {
  if (pain) return '<span class="call up">Pain: same or lighter weight next time. If it is sharp, builds with each rep or lasts into the next day, drop this exercise and see your GP.</span>';
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
  const target = suggestFor(state, ctx.plan, ex, date);
  const loaded = ex.load === 'db';
  const range = ex.max === null ? 'max effort' : ex.min === ex.max ? `${ex.max}` : `${ex.min}-${ex.max}`;
  const unit = ex.unit === 'sec' ? ' sec' : '';
  let rows = '';
  for (let i = 0; i < rowsCount; i += 1) {
    const set = sets[i] || {};
    const tr = target.reps[i] ?? target.reps[target.reps.length - 1];
    const filled = Number.isFinite(set.r);
    rows += `<div class="set-row${loaded ? '' : ' noload'}">
      <span class="n">${i + 1}</span>
      ${loaded ? `<input type="text" inputmode="decimal" aria-label="${esc(ex.name)} set ${i + 1} weight kg" placeholder="${esc(target.w ?? 'kg')}" data-ex="${ex.id}" data-i="${i}" data-f="w" value="${esc(set.w)}">` : ''}
      <input type="text" inputmode="numeric" aria-label="${esc(ex.name)} set ${i + 1} ${ex.unit}" placeholder="${esc(tr ?? (ex.unit === 'sec' ? 'sec' : 'reps'))}" data-ex="${ex.id}" data-i="${i}" data-f="r" value="${esc(set.r)}">
      <button class="fill${filled ? ' on' : ''}" data-action="fill-set" data-ex="${ex.id}" data-i="${i}" aria-label="Set ${i + 1} done as suggested"${tr === undefined ? ' disabled' : ''}>✓</button>
    </div>`;
  }
  const targetText = target.reps.length
    ? `${target.w !== null ? `${target.w} kg x ` : ''}${target.reps.join(', ')}${ex.unit === 'sec' ? ' sec' : ''}`
    : '';
  const targetHtml = `<div class="target">${targetText ? `<b>Today: <span class="num">${esc(targetText)}</span></b>` : ''}<span>${esc(target.note)}${targetText ? ' Tap ✓ when a set matches.' : ''}</span></div>`;
  const reserve = ex.load === 'db' && ex.max !== null
    ? `<label class="toggle"><input type="checkbox" data-reserve="${ex.id}" ${session.reserve?.[ex.id] ? 'checked' : ''}>2+ reps left</label>` : '';
  return `<section class="card ex" id="ex-${ex.id}">
    <h3>${esc(ex.name)}${ex.priority ? ' <span class="tag">upper body priority</span>' : ''}</h3>
    <div class="sub num">${required} x ${range}${unit}${ex.each ? ' each side' : ''}, rest ${esc(ex.rest)}</div>
    <div class="cue">${esc(ex.cue)}</div>
    ${howToHtml(ctx.plan, ex.how || ex.id)}
    ${lastLine(last, ex, ctx.plan.maxDumbbellKg)}
    ${targetHtml}
    ${rows}
    <div class="ex-foot">
      <span id="call-${ex.id}">${callHtml(ex, sets, required, ctx.plan.maxDumbbellKg, Boolean(session.pain?.[ex.id]))}</span>
      ${reserve}
      <label class="toggle"><input type="checkbox" data-pain="${ex.id}" ${session.pain?.[ex.id] ? 'checked' : ''}>Pain</label>
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
  const warm = session.retest ? '' : `<details class="card warm"><summary>Warm up, 8 to 10 min</summary><div class="warm-list">${plan.warmup.map((w) => howToHtml(plan, w.how, w.name)).join('')}</div></details>`;
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
      ${warm}
      <p class="fine">Stop a set if your lower back arches, shoulder blades flare, or neck and traps take over. Drop the weight, not the quality.</p>
      ${cards}${finish}`,
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
        <div class="settings-row"><span>Week 1 starts</span><input type="date" data-setting="startDate" value="${esc(s.startDate)}"></div>
        ${golf}
        <div class="settings-row"><span>Smallest dumbbell jump</span><select data-setting="jumpKg">${[1, 1.25, 2, 2.5].map((j) => `<option value="${j}"${(s.jumpKg || 2) === j ? ' selected' : ''}>${j} kg</option>`).join('')}</select></div>
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
          <li>Regular timing also matters: Windred et al. 2024, <i>Sleep</i>. UK Biobank, observational. Your work days already fix most wake times, so keep weekend lie-ins within about 2 hours.</li>
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
