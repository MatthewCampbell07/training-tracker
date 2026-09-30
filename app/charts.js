// Small hand-built SVG charts. Colours come from CSS variables so light and dark both work.
import { addDays, dayScore, scheduledSession, sessionIsDone, weekStart } from './logic.js';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function heatmap(state, plan, settings, todayIso) {
  const cell = 30;
  const gap = 4;
  const left = 30;
  const top = 18;
  const w = left + 7 * (cell + gap);
  const h = top + plan.weeks * (cell + gap);
  let out = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily habit completion for all ${plan.weeks} weeks">`;
  DOW.forEach((d, i) => {
    out += `<text x="${left + i * (cell + gap) + cell / 2}" y="11" class="axis" text-anchor="middle">${d}</text>`;
  });
  for (let wk = 1; wk <= plan.weeks; wk += 1) {
    const y = top + (wk - 1) * (cell + gap);
    const deload = plan.deloadWeeks.includes(wk);
    out += `<text x="${left - 8}" y="${y + cell / 2 + 4}" class="axis${deload ? ' flag' : ''}" text-anchor="end">${wk}</text>`;
    for (let i = 0; i < 7; i += 1) {
      const iso = addDays(weekStart(wk, settings.startDate), i);
      const x = left + i * (cell + gap);
      const future = iso > todayIso;
      const score = future ? 0 : dayScore(state, iso, plan);
      const title = `${iso}: ${Math.round(score * 100)}% of habits`;
      out += `<g data-goto="${iso}"><title>${title}</title>`;
      out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="6" class="hm-base${future ? ' future' : ''}${iso === todayIso ? ' today' : ''}"/>`;
      if (score > 0) out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="6" class="hm-fill" opacity="${0.18 + 0.82 * score}"/>`;
      const letter = scheduledSession(iso, plan, settings);
      if (letter) {
        const done = sessionIsDone(state.sessions[iso]);
        out += `<circle cx="${x + cell - 7}" cy="${y + 7}" r="4" class="${done ? 'dot-done' : 'dot-open'}"/>`;
      }
      out += '</g>';
    }
  }
  return `${out}</svg>`;
}

export function weekBars(values, currentWeek, plan) {
  const bw = 20;
  const gap = 8;
  const h = 110;
  const base = 90;
  const w = values.length * (bw + gap);
  let out = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Habit completion by week">`;
  out += `<line x1="0" x2="${w}" y1="${base - 80 * 0.8}" y2="${base - 80 * 0.8}" class="ref"/>`;
  values.forEach((v, i) => {
    const x = i * (bw + gap) + gap / 2;
    const wk = i + 1;
    const bh = v === null ? 0 : Math.max(2, v * 80);
    const cls = wk === currentWeek ? 'bar current' : 'bar';
    if (v !== null) out += `<rect x="${x}" y="${base - bh}" width="${bw}" height="${bh}" rx="3" class="${cls}"><title>Week ${wk}: ${Math.round(v * 100)}%</title></rect>`;
    out += `<text x="${x + bw / 2}" y="${h - 6}" class="axis${plan.deloadWeeks.includes(wk) ? ' flag' : ''}" text-anchor="middle">${wk}</text>`;
  });
  return `${out}</svg>`;
}

// points: [{x: label, y: number, note}] oldest first.
export function lineChart(points, { ref = null, unit = '', height = 90 } = {}) {
  const w = 300;
  const pad = { l: 30, r: 10, t: 12, b: 16 };
  if (points.length === 0) return '<p class="empty">No data yet.</p>';
  const ys = points.map((p) => p.y).concat(ref !== null ? [ref] : []);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const sx = (i) => pad.l + (points.length === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (points.length - 1));
  const sy = (v) => pad.t + ((hi - v) * (height - pad.t - pad.b)) / (hi - lo);
  let out = `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img">`;
  out += `<text x="${pad.l - 6}" y="${sy(hi) + 4}" class="axis" text-anchor="end">${fmt(hi)}</text>`;
  out += `<text x="${pad.l - 6}" y="${sy(lo) + 4}" class="axis" text-anchor="end">${fmt(lo)}</text>`;
  if (ref !== null) out += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(ref)}" y2="${sy(ref)}" class="ref"/><text x="${w - pad.r}" y="${sy(ref) - 4}" class="axis" text-anchor="end">${ref}${unit}</text>`;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  out += `<path d="${path}" class="line"/>`;
  points.forEach((p, i) => {
    out += `<circle cx="${sx(i)}" cy="${sy(p.y)}" r="3.5" class="pt"><title>${p.x}: ${fmt(p.y)}${unit}${p.note ? ` (${p.note})` : ''}</title></circle>`;
  });
  const last = points[points.length - 1];
  out += `<text x="${sx(points.length - 1)}" y="${height - 3}" class="axis" text-anchor="end">${last.x.slice(5)}</text>`;
  return `${out}</svg>`;
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
