// Recovery screen: draws the daily summary the garmin-recovery script on the Mac pushes to the cloud.
// The script does all the maths; this file only lays it out. SCHEMA must match garmin_recovery/snapshot.py.
import { esc, fmtDate } from './views.js';

export const SCHEMA = 1;
const ZONE = {
  green: { word: 'Ready to push', css: 'var(--rec-green)' },
  yellow: { word: "Train, don't max out", css: 'var(--rec-yellow)' },
  red: { word: 'Recover today', css: 'var(--red)' },
};
const STAGES = [['deep', 'Deep', 'var(--navy-stage)'], ['rem', 'REM', 'var(--blue)'], ['light', 'Light', 'var(--blue-mid)'], ['awake', 'Awake', 'var(--line)']];

export function hm(hours) {
  if (hours === null || hours === undefined) return '-';
  const mins = Math.round(hours * 60);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

function ring(pct, colour, size, stroke, big, small, band = null) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, pct)) * c;
  const mid = size / 2;
  const bandArc = band
    ? `<circle r="${r}" cx="${mid}" cy="${mid}" stroke="${colour}" stroke-opacity=".22" stroke-width="${stroke}" stroke-dasharray="${((band[1] - band[0]) * c).toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-band[0] * c).toFixed(1)}"/>`
    : '';
  const arc = fill > 0
    ? `<circle r="${r}" cx="${mid}" cy="${mid}" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${fill.toFixed(1)} ${c.toFixed(1)}"/>`
    : '';
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring-track" r="${r}" cx="${mid}" cy="${mid}" stroke-width="${stroke}"/>${bandArc}${arc}</svg>
    <div class="ring-val"><b class="num" style="font-size:${Math.round(size * 0.28)}px">${esc(big)}</b><span>${esc(small)}</span></div></div>`;
}

function hero(s) {
  if (!s.setup.done) {
    const { nights, needed } = s.setup;
    const logged = Boolean(s.sleep);
    const left = needed - nights;
    const head = logged ? 'Night logged' : 'Wear it to bed tonight';
    let body = logged
      ? `<b>${left} more</b> night${left === 1 ? '' : 's'} in the watch and your full Recovery score unlocks.`
      : nights === 0 ? `Recovery learns your normal over ${needed} nights. <b>Tonight starts it.</b>`
        : `<b>${nights} of ${needed}</b> nights banked. Don't break the run.`;
    if (s.recovery) body += ` Early read from sleep: <b>${s.recovery.score}%</b>.`;
    return `<section class="card rec-hero" style="--zone:var(--blue)">
      ${ring(nights / needed, 'var(--blue)', 124, 12, `${nights}/${needed}`, 'Nights')}
      <div><p class="rec-zone">Setting up</p><h3>${head}</h3><p class="rec-copy">${body}</p></div></section>`;
  }
  const z = ZONE[s.recovery.zone];
  const t = s.strain.target;
  return `<section class="card rec-hero" style="--zone:${z.css}">
    ${ring(s.recovery.score / 100, z.css, 124, 12, `${s.recovery.score}%`, 'Recovery')}
    <div><p class="rec-zone">${esc(s.recovery.zone)}</p><h3>${z.word}</h3>
    <p class="rec-copy">${t ? `Aim for strain <b>${Math.round(t[0])} to ${Math.round(t[1])}</b> today.` : ''}</p></div></section>`;
}

function weekStrip(s) {
  const dots = s.week.map((d) => `<li class="${d.worn ? 'on' : 'off'}" title="${esc(d.date)}">${esc(fmtDate(d.date, { weekday: 'narrow' }))}</li>`).join('');
  const worn = s.week.filter((d) => d.worn).length;
  const label = s.streak >= 2 ? `${s.streak} night streak` : `${worn} of ${s.week.length} nights worn`;
  return `<section class="rec-week" aria-label="Nights worn this week"><ol>${dots}</ol><span class="streak">${label}</span></section>`;
}

function pair(s) {
  const st = s.strain;
  const band = st.target ? [st.target[0] / st.max, st.target[1] / st.max] : null;
  const strainMeta = `<b>${Math.round(st.hardMinutes)} min</b> hard effort today${st.target ? `<br>target <b>${Math.round(st.target[0])} to ${Math.round(st.target[1])}</b>` : ''}`;
  const sl = s.sleep;
  const sleepRing = sl ? ring(sl.performance, 'var(--red)', 96, 9, `${Math.round(sl.performance * 100)}%`, 'Sleep') : ring(0, 'var(--red)', 96, 9, '-', 'Sleep');
  const sleepMeta = sl ? `<b>${hm(sl.hours)}</b> of ${hm(sl.need)} needed` : 'No sleep recorded';
  const bed = s.tonight.bedtime ? ` Lights out by <b>${esc(s.tonight.bedtime)}</b> for your usual ${esc(s.tonight.wake)} wake.` : '';
  return `<div class="rec-pair">
    <section class="card">${ring(st.value / st.max, 'var(--blue)', 96, 9, st.value.toFixed(1), 'Strain', band)}<p>${strainMeta}</p></section>
    <section class="card">${sleepRing}<p>${sleepMeta}</p></section></div>
    <p class="fine rec-tonight">Tonight you need <b>${hm(s.tonight.need)}</b>.${bed}</p>`;
}

function delta(value, base, unit, higherGood) {
  if (value === null || value === undefined || base === null || base === undefined) return '<span class="rec-delta">building baseline</span>';
  const diff = value - base;
  if (Math.abs(diff) < 0.5) return `<span class="rec-delta">at your ${Math.round(base)} norm</span>`;
  const good = higherGood ? diff > 0 : diff < 0;
  return `<span class="rec-delta ${good ? 'good' : 'warn'}">${diff > 0 ? '+' : ''}${Math.round(diff)}${unit} vs ${Math.round(base)} norm</span>`;
}

function tile(label, value, unit, extra) {
  const v = value === null || value === undefined ? '-' : value;
  return `<div class="rec-tile"><span>${label}</span><b class="num">${v}<i>${unit}</i></b>${extra}</div>`;
}

function drivers(s) {
  const d = s.drivers;
  if (d.restingHr === null && d.bodyBattery === null && !s.sleep) return '';
  const nerve = d.hrv !== null
    ? tile('HRV overnight', d.hrv === null ? null : Math.round(d.hrv), 'ms', delta(d.hrv, d.hrvBase, 'ms', true))
    : tile('Overnight stress', d.stress === null ? null : Math.round(d.stress), '/100', delta(d.stress, d.stressBase, '', false));
  const charge = d.recharge === null ? null : `${d.recharge >= 0 ? '+' : ''}${Math.round(d.recharge)}`;
  return `<section class="card"><h2>What drove it</h2><div class="rec-tiles">
    ${nerve}
    ${tile('Resting HR', d.restingHr === null ? null : Math.round(d.restingHr), 'bpm', delta(d.restingHr, d.restingHrBase, '', false))}
    ${tile('Body Battery', d.bodyBattery === null ? null : Math.round(d.bodyBattery), d.bodyBatteryHigh ? ` / ${Math.round(d.bodyBatteryHigh)} high` : '', '<span class="rec-delta">right now</span>')}
    ${tile('Sleep recharge', charge, 'battery', delta(d.recharge, d.rechargeBase, '', true))}
  </div></section>`;
}

function stages(s) {
  const sl = s.sleep;
  if (!sl) return '';
  const parts = STAGES.filter(([k]) => sl[k] > 0);
  const bar = parts.map(([k, , c]) => `<div style="flex:${sl[k]};background:${c}"></div>`).join('');
  const legend = parts.map(([k, n, c]) => `<span><i class="dot" style="background:${c}"></i> ${n} ${hm(sl[k])}</span>`).join('');
  return `<section class="card"><h2>Last night</h2><div class="rec-stages">${bar}</div><div class="legend">${legend}</div></section>`;
}

export function compareVerdict(c) {
  if (!c.enough) return `Early days. Needs ${c.minNights}+ nights of each to mean much (${c.lift?.nights ?? 0} vs ${c.rest?.nights ?? 0} so far).`;
  if (c.rechargeGap === null) return '';
  if (Math.abs(c.rechargeGap) < 3) return "Lifting isn't costing you overnight recharge.";
  return c.rechargeGap > 0
    ? `You recharge <b>${Math.round(c.rechargeGap)} less</b> after lifting. That's muscle repair, not bad sleep.`
    : `You recharge <b>${Math.round(-c.rechargeGap)} more</b> after lifting.`;
}

function compare(s) {
  const c = s.compare;
  if (!c || !c.lift || !c.rest || (c.lift.nights + c.rest.nights) === 0) return '';
  const fmt = (v, f) => (v === null || v === undefined ? '-' : f(v));
  const rows = [
    ['Recharge', (g) => fmt(g.recharge, (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}`)],
    ['Overnight stress', (g) => fmt(g.stress, Math.round)],
    ['Resting HR', (g) => fmt(g.restingHr, Math.round)],
    ['Asleep', (g) => fmt(g.sleep, hm)],
  ].map(([label, f]) => `<tr><th>${label}</th><td class="num">${f(c.lift)}</td><td class="num">${f(c.rest)}</td></tr>`).join('');
  const n = (g) => `${g.nights} night${g.nights === 1 ? '' : 's'}`;
  return `<section class="card"><h2>Lifting vs rest nights</h2><table class="rec-compare">
    <thead><tr><th></th><th>After lifting<small>${n(c.lift)}</small></th><th>After rest<small>${n(c.rest)}</small></th></tr></thead>
    <tbody>${rows}</tbody></table><p class="fine">${compareVerdict(c)}</p></section>`;
}

function trend(s) {
  const days = s.trend;
  if (!days.some((d) => d.recovery !== null || d.strain > 0)) return '';
  const w = 340; const h = 110; const pad = 6;
  const step = (w - 2 * pad) / days.length;
  const base = h - 20;
  const marks = days.map((d, i) => {
    const x = pad + i * step;
    let out = '';
    if (d.recovery !== null) {
      const bh = (base - 10) * d.recovery / 100;
      out += `<rect x="${(x + step * 0.2).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${(step * 0.6).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${ZONE[d.zone].css}" opacity=".85"/>`;
    }
    if (d.lifted) out += `<rect x="${(x + step * 0.3).toFixed(1)}" y="${base + 3}" width="${(step * 0.4).toFixed(1)}" height="3" rx="1.5" fill="var(--ink)" opacity=".5"/>`;
    if ((days.length - 1 - i) % 2 === 0) out += `<text x="${(x + step / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(fmtDate(d.date, { day: 'numeric' }))}</text>`;
    return out;
  }).join('');
  const line = days.map((d, i) => `${(pad + i * step + step / 2).toFixed(1)},${(base - (base - 10) * d.strain / 21).toFixed(1)}`).join(' ');
  return `<section class="card"><h2>Last ${days.length} days</h2>
    <svg class="chart rec-trend" viewBox="0 0 ${w} ${h}" role="img" aria-label="Recovery bars and strain line">${marks}<polyline points="${line}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/></svg>
    <div class="legend"><span><i class="dot" style="background:var(--rec-green)"></i> Recovery</span><span><i class="dot" style="background:var(--blue)"></i> Strain</span><span><i class="dot" style="background:var(--ink);opacity:.5;height:4px"></i> Lifted</span></div></section>`;
}

function todaySection(s) {
  const t = s.today;  // added after schema 1 shipped; older snapshots don't have it
  if (!t || (t.dayStress === null && !t.activities.length)) return '';
  let stress = '';
  if (t.dayStress !== null) {
    stress = `<p class="rec-copy">Daytime stress <b class="num">${Math.round(t.dayStress)}</b>`;
    if (t.dayStressUnadjusted !== null && Math.abs(t.dayStressUnadjusted - t.dayStress) >= 0.5) {
      stress += ` (${Math.round(t.dayStressUnadjusted)} before added exercise was taken out)`;
    }
    stress += '</p>';
  }
  const items = t.activities.map((a) => `<div class="settings-row"><span>${esc(a.name)}${a.added ? ' <span class="tag">added</span>' : ''}</span>
    <span class="fine num">${Math.round(a.minutes)} min${a.avgHr ? ` · avg ${Math.round(a.avgHr)} bpm` : ''}</span></div>`).join('');
  return `<section class="card"><h2>Today</h2>${stress}${items}</section>`;
}

function stale(s, today) {
  if (s.date === today) return '';
  return `<p class="target">Last updated ${esc(fmtDate(s.date))}. Run <b>daily</b> on your Mac for today's scores.</p>`;
}

export function recoveryView(ctx) {
  const r = ctx.recovery || {};
  const title = 'Recovery';
  if (!ctx.cloud.signedIn) {
    return { title, sub: '', nav: [], body: '<section class="card"><p>Sign in under <b>Settings</b> to see your Garmin recovery here.</p></section>' };
  }
  const s = r.snap;
  if (!s) {
    const msg = r.status === 'error' ? esc(r.error || 'Could not load recovery.') : r.status === 'none'
      ? 'No recovery data yet. Run <b>uv run garmin-recovery daily</b> on your Mac.' : 'Loading...';
    return { title, sub: '', nav: [], body: `<section class="card"><p>${msg}</p></section>` };
  }
  if (s.v !== SCHEMA) {
    return { title, sub: '', nav: [], body: '<section class="card"><p>Recovery data is from a newer version. Refresh the app.</p></section>' };
  }
  const note = r.status === 'error' ? `<p class="fine">Showing saved copy (${esc(r.error)}).</p>` : '';
  return {
    title,
    sub: `${s.device} · ${fmtDate(s.date)}`,
    nav: [],
    body: stale(s, ctx.today) + hero(s) + weekStrip(s) + pair(s) + drivers(s) + todaySection(s) + stages(s) + compare(s) + trend(s) + note,
  };
}
