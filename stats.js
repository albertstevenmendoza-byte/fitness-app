/* ============================================================
   SHREDDED — Stats Tab Module (Phase 7)
   ------------------------------------------------------------
   Surfaces:
     · Energy Expenditure (Mifflin-St Jeor BMR, TDEE multipliers)
     · Weekly Volume bar chart (last 8 weeks)
     · 60-day Body Weight scatter + linear-regression line
     · 14-day Nutrition Adherence strip + streak
     · 1RM & Plateau Detection table (Brzycki e1RM)
     · Citations card

   Read-only consumer of all other tabs' data.
   Schema additions (lazy): state.userBio = { heightCm, ageYears,
   sex, activityMultiplier }. Defaults inlined.
   ============================================================ */
(function () {
  'use strict';

  const App        = window.SHREDDED_APP;
  const EXERCISES  = window.SHREDDED_EXERCISES;
  const MEALS      = window.SHREDDED_MEALS;
  if (!App || !EXERCISES || !MEALS) { console.error('[stats] deps missing'); return; }

  const SLOTS = ['5am', '9am', '1pm', '6pm'];

  /* ---------------------------------------------------------- */
  /* MATH HELPERS                                                */
  /* ---------------------------------------------------------- */
  // Mifflin-St Jeor
  function bmrMifflin(kg, cm, age, sex) {
    return 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5);
  }

  // Brzycki estimated 1RM
  function brzycki(w, r) { return r >= 37 ? w : w * (36 / (37 - r)); }

  // Least-squares linear regression over [{x, y}, ...]
  function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    let xMean = 0, yMean = 0;
    for (const p of points) { xMean += p.x; yMean += p.y; }
    xMean /= n; yMean /= n;
    let num = 0, den = 0;
    for (const p of points) {
      num += (p.x - xMean) * (p.y - yMean);
      den += (p.x - xMean) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    return { slope, intercept: yMean - slope * xMean };
  }

  // ISO week key "YYYY-Www"
  function isoWeekKey(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay() || 7;          // Sun=0 → 7
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  // Days between two YMD strings (b - a)
  function daysBetweenYMD(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  }

  // Add N days to a YMD string
  function addDaysYMD(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  function fmtMonthDay(ymd) {
    const [y, m, d] = ymd.split('-');
    const dt = new Date(+y, +m - 1, +d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDayLetter(ymd) {
    const [y, m, d] = ymd.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'narrow' });
  }

  /* ---------------------------------------------------------- */
  /* AGGREGATIONS                                                */
  /* ---------------------------------------------------------- */
  function getUserBio(state) {
    const bio = state.get('userBio') || {};
    return {
      heightCm: bio.heightCm ?? 175,
      ageYears: bio.ageYears ?? 35,
      sex: bio.sex ?? 'male',
      activityMultiplier: bio.activityMultiplier ?? 1.55
    };
  }

  function currentWeightLbs(state) {
    const arr = state.get('body') || [];
    if (arr.length) {
      const sorted = arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      return sorted[0].weight;
    }
    return state.get('program.stats.startWeightLbs') ?? 147;
  }

  function targetForDate(state, ymd) {
    const ramp = state.get('program.calorieRamp');
    const start = state.get('program.startDate');
    if (!ramp || !start) return null;
    const week = SHREDDED.DateUtil.programWeek(start, ramp.totalWeeks, ymd);
    return Math.min(ramp.ceiling, ramp.base + ramp.stepPerWeek * (week - 1));
  }

  // Total kcal consumed on a specific date (parallel to meals.js dailyConsumed)
  function consumedOn(state, ymd) {
    const m = state.get(`meals.${ymd}`) || { selections: {}, checked: {}, usda: [] };
    const ramp = state.get('program.calorieRamp');
    const start = state.get('program.startDate');
    const week = (ramp && start) ? SHREDDED.DateUtil.programWeek(start, ramp.totalWeeks, ymd) : 1;
    let kcal = 0;
    for (const slot of SLOTS) {
      if (!m.checked?.[slot]) continue;
      const idx = m.selections?.[slot] ?? 0;
      const slotData = MEALS[slot];
      const opt = slotData.options[idx];
      if (!opt) continue;
      let base = 0;
      for (const i of opt.ingredients) base += i.kcal || 0;
      const adj = slotData.weekly?.[week - 1];
      kcal += base + (adj?.kcal || 0);
    }
    for (const u of (m.usda || [])) kcal += u.kcal || 0;
    return kcal;
  }

  // Group workouts by ISO week → { weekKey → { volume, sessions, weekStart } }
  function workoutsByWeek(state) {
    const workouts = state.get('workouts') || {};
    const byWeek = {};
    for (const date in workouts) {
      const w = workouts[date];
      if (!w?.exercises) continue;
      const key = isoWeekKey(date);
      if (!byWeek[key]) byWeek[key] = { weekKey: key, volume: 0, sessions: 0, weekStart: date };
      if (date < byWeek[key].weekStart) byWeek[key].weekStart = date;
      let hadAny = false;
      for (const exId in w.exercises) {
        for (const set of w.exercises[exId]) {
          byWeek[key].volume += set.weight * set.reps;
          hadAny = true;
        }
      }
      if (hadAny) byWeek[key].sessions += 1;
    }
    return Object.values(byWeek).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  // Per-exercise session list with top-set e1RM, sorted by date asc
  function sessionsForExercise(state, exId) {
    const workouts = state.get('workouts') || {};
    const out = [];
    for (const date of Object.keys(workouts).sort()) {
      const sets = workouts[date]?.exercises?.[exId];
      if (!sets || !sets.length) continue;
      const topE1RM = Math.max(...sets.map((s) => brzycki(s.weight, s.reps)));
      const topWeight = Math.max(...sets.map((s) => s.weight));
      out.push({ date, topE1RM, topWeight, sets });
    }
    return out;
  }

  // Plateau check: last 3 sessions, range < 5%, non-increasing
  function plateauForExercise(state, exId) {
    const sessions = sessionsForExercise(state, exId);
    if (sessions.length < 3) return { sessions, plateau: false, status: 'baseline' };
    const last3 = sessions.slice(-3);
    const max = Math.max(...last3.map((s) => s.topE1RM));
    const min = Math.min(...last3.map((s) => s.topE1RM));
    const range = max > 0 ? (max - min) / max : 0;
    const nonIncreasing = last3[2].topE1RM <= last3[0].topE1RM + 0.5;
    const delta = last3[2].topE1RM - last3[0].topE1RM;
    let status = 'progressing';
    if (nonIncreasing && range < 0.05) status = 'plateau';
    else if (delta < -1) status = 'regressing';
    return { sessions, last3, plateau: status === 'plateau', status, delta };
  }

  function exerciseProgressList(state) {
    const workouts = state.get('workouts') || {};
    const exIds = new Set();
    for (const date in workouts) {
      const ex = workouts[date]?.exercises;
      if (!ex) continue;
      for (const id of Object.keys(ex)) exIds.add(id);
    }
    const items = [];
    for (const exId of exIds) {
      const ex = EXERCISES[exId];
      if (!ex) continue;
      const p = plateauForExercise(state, exId);
      if (!p.sessions.length) continue;
      const last = p.sessions[p.sessions.length - 1];
      items.push({ exId, name: ex.name, group: ex.group, ...p, lastDate: last.date, currentE1RM: Math.round(last.topE1RM) });
    }
    // Sort: plateau first, then most recent activity
    items.sort((a, b) => {
      if (a.plateau !== b.plateau) return a.plateau ? -1 : 1;
      return a.lastDate < b.lastDate ? 1 : -1;
    });
    return items;
  }

  /* ---------------------------------------------------------- */
  /* TEMPLATES                                                   */
  /* ---------------------------------------------------------- */

  function tplStats(state) {
    return `
      <div class="stats">
        ${tplEnergy(state)}
        ${tplVolume(state)}
        ${tplWeightTrend(state)}
        ${tplNutrition(state)}
        ${tplPlateau(state)}
        ${tplCitations()}
      </div>
    `;
  }

  /* ---------- Energy Expenditure ---------- */
  function tplEnergy(state) {
    const bio = getUserBio(state);
    const wLbs = currentWeightLbs(state);
    const kg = wLbs / 2.2046;
    const bmr = Math.round(bmrMifflin(kg, bio.heightCm, bio.ageYears, bio.sex));
    const multipliers = [
      { id: 1.2,   label: 'Sedentary',  detail: 'Desk job, no exercise' },
      { id: 1.375, label: 'Light',      detail: '1–3 sessions/week' },
      { id: 1.55,  label: 'Moderate',   detail: '3–5 sessions/week' },
      { id: 1.725, label: 'Active',     detail: '6+ intense sessions' }
    ];
    const tdee = Math.round(bmr * bio.activityMultiplier);
    const today = SHREDDED.DateUtil.todayYMD();
    const todayTarget = targetForDate(state, today);
    const tdeePct = todayTarget && tdee > 0 ? Math.round((todayTarget / tdee) * 100) : null;
    const surplus = todayTarget != null ? todayTarget - tdee : null;

    return `
      <section class="card energy">
        <header class="energy__head">
          <div>
            <p class="card__eyebrow">Energy</p>
            <h2 class="card__title">Mifflin-St Jeor</h2>
          </div>
          <button class="energy__settings" data-bio-edit aria-label="Edit bio">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
            </svg>
          </button>
        </header>

        <div class="energy__nums">
          <div class="energy__num-block">
            <span class="energy__num-label">BMR</span>
            <span class="energy__num tnum">${bmr.toLocaleString()}</span>
            <span class="energy__num-unit">kcal at rest</span>
          </div>
          <div class="energy__divider"></div>
          <div class="energy__num-block">
            <span class="energy__num-label">TDEE</span>
            <span class="energy__num energy__num--accent tnum">${tdee.toLocaleString()}</span>
            <span class="energy__num-unit">kcal/day total</span>
          </div>
        </div>

        <p class="energy__bio-line">
          ${wLbs.toFixed(1)} lbs · ${bio.heightCm} cm · ${bio.ageYears} y/o ${bio.sex}
        </p>

        <div class="mult-list">
          ${multipliers.map((m) => `
            <button class="mult ${Math.abs(m.id - bio.activityMultiplier) < 0.001 ? 'is-active' : ''}" data-mult="${m.id}">
              <span class="mult__radio" aria-hidden="true">
                ${Math.abs(m.id - bio.activityMultiplier) < 0.001 ? '<span></span>' : ''}
              </span>
              <div class="mult__main">
                <span class="mult__label">${m.label}</span>
                <span class="mult__detail">${m.detail}</span>
              </div>
              <span class="mult__num tnum">${m.id}</span>
            </button>
          `).join('')}
        </div>

        ${todayTarget != null ? `
          <div class="energy__target">
            <span class="energy__target-label">Today's target</span>
            <span class="energy__target-num tnum">${todayTarget.toLocaleString()}</span>
            <span class="energy__target-unit">kcal</span>
            <span class="energy__target-pct ${surplus < -100 ? 'is-deficit' : surplus > 100 ? 'is-surplus' : 'is-maint'}">
              ${surplus === 0 ? 'maintenance' :
                surplus < 0 ? `${Math.abs(surplus).toLocaleString()} kcal deficit (${tdeePct}% TDEE)` :
                              `+${surplus.toLocaleString()} kcal surplus (${tdeePct}% TDEE)`}
            </span>
          </div>
        ` : ''}
      </section>
    `;
  }

  /* ---------- Weekly Volume Bar Chart ---------- */
  function tplVolume(state) {
    const weeks = workoutsByWeek(state);
    const recent = weeks.slice(-8);
    const empty = recent.length === 0;
    if (empty) {
      return `
        <section class="card volume">
          <p class="card__eyebrow">Weekly Volume</p>
          <h2 class="card__title">No sessions logged yet</h2>
          <p class="muted" style="font-size:13px; margin-top:6px;">Volume = total weight × reps across all sets, grouped by ISO week.</p>
        </section>
      `;
    }
    const maxV = Math.max(...recent.map((w) => w.volume), 1);
    const W = 320, H = 160, padL = 36, padR = 8, padT = 12, padB = 30;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barCount = recent.length;
    const barGap = 8;
    const barW = (innerW - barGap * (barCount - 1)) / barCount;
    // Y axis ticks (0, max/2, max)
    const tickVals = [0, maxV / 2, maxV];
    const isLatest = (w) => w === recent[recent.length - 1];

    // WoW delta
    const cur = recent[recent.length - 1];
    const prev = recent.length >= 2 ? recent[recent.length - 2] : null;
    const wow = (prev && prev.volume > 0) ? ((cur.volume - prev.volume) / prev.volume) * 100 : null;

    return `
      <section class="card volume">
        <header class="row row--between">
          <div>
            <p class="card__eyebrow">Weekly Volume</p>
            <h2 class="card__title">Last ${recent.length} week${recent.length === 1 ? '' : 's'}</h2>
          </div>
          <span class="muted" style="font-size:11px; font-weight:700; letter-spacing:0.04em;">∑ weight × reps</span>
        </header>
        <div class="vol-chart-wrap">
          <svg class="vol-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="volBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"  stop-color="#4FFBE0"/>
                <stop offset="100%" stop-color="#00B89E"/>
              </linearGradient>
              <linearGradient id="volBarGradDim" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"  stop-color="rgba(0,229,199,0.45)"/>
                <stop offset="100%" stop-color="rgba(0,229,199,0.18)"/>
              </linearGradient>
            </defs>
            <!-- Y grid lines + labels -->
            ${tickVals.map((v) => {
              const y = padT + innerH - (v / maxV) * innerH;
              return `
                <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
                <text x="${padL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(213,229,235,0.5)" font-weight="700">${formatVolShort(v)}</text>
              `;
            }).join('')}
            <!-- Bars -->
            ${recent.map((w, i) => {
              const x = padL + i * (barW + barGap);
              const h = (w.volume / maxV) * innerH;
              const y = padT + innerH - h;
              const fill = isLatest(w) ? 'url(#volBarGrad)' : 'url(#volBarGradDim)';
              return `
                <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(h, 0.5).toFixed(2)}" rx="3" fill="${fill}"/>
              `;
            }).join('')}
            <!-- X labels -->
            ${recent.map((w, i) => {
              const x = padL + i * (barW + barGap) + barW / 2;
              const label = fmtMonthDay(w.weekStart);
              return `<text x="${x.toFixed(1)}" y="${(H - 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="${isLatest(w) ? '#4FFBE0' : 'rgba(213,229,235,0.55)'}" font-weight="700">${label}</text>`;
            }).join('')}
          </svg>
        </div>

        <div class="vol-foot">
          <span class="vol-foot__cur">
            Current <span class="tnum">${Math.round(cur.volume).toLocaleString()}</span> lbs
          </span>
          ${wow !== null ? `
            <span class="vol-foot__wow ${wow >= 0 ? 'is-up' : 'is-down'}">
              ${wow >= 0 ? '↑' : '↓'} ${Math.abs(wow).toFixed(0)}% WoW
            </span>` : ''}
        </div>
      </section>
    `;
  }
  function formatVolShort(v) {
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return String(Math.round(v));
  }

  /* ---------- Body Weight 60-day Trend ---------- */
  function tplWeightTrend(state) {
    const all = state.get('body') || [];
    if (all.length < 2) {
      return `
        <section class="card wtrend">
          <p class="card__eyebrow">Weight Trend</p>
          <h2 class="card__title">Need 2+ logs to fit a line</h2>
          <p class="muted" style="font-size:13px; margin-top:6px;">Linear regression (least squares) over 60-day window. Log a second body entry to activate.</p>
        </section>
      `;
    }
    const today = SHREDDED.DateUtil.todayYMD();
    const sixtyAgo = addDaysYMD(today, -60);
    const within = all.filter((e) => e.date >= sixtyAgo).sort((a, b) => a.date.localeCompare(b.date));
    if (within.length < 2) {
      return `
        <section class="card wtrend">
          <p class="card__eyebrow">Weight Trend</p>
          <h2 class="card__title">Insufficient recent data</h2>
          <p class="muted" style="font-size:13px; margin-top:6px;">Last 60 days has fewer than 2 logs. Add another to fit a regression line.</p>
        </section>
      `;
    }

    const earliestDate = within[0].date;
    const latestDate   = within[within.length - 1].date;
    const days = Math.max(1, daysBetweenYMD(earliestDate, latestDate));
    const points = within.map((e) => ({ x: daysBetweenYMD(earliestDate, e.date), y: e.weight }));
    const fit = linearRegression(points);
    const slopePerDay = fit ? fit.slope : 0;
    const slopePerWeek = slopePerDay * 7;

    const ys = points.map((p) => p.y);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const yRange = Math.max(0.6, yMax - yMin);
    const yLo = yMin - yRange * 0.15;
    const yHi = yMax + yRange * 0.15;

    const W = 320, H = 160, padL = 36, padR = 8, padT = 12, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const sx = (xv) => padL + (xv / days) * innerW;
    const sy = (yv) => padT + innerH - ((yv - yLo) / (yHi - yLo)) * innerH;

    // Regression line endpoints
    const lineY1 = fit ? fit.intercept                          : null;
    const lineY2 = fit ? fit.intercept + fit.slope * days       : null;

    // Y axis ticks (3 levels)
    const tickYs = [yLo + (yHi - yLo) * 0, yLo + (yHi - yLo) * 0.5, yLo + (yHi - yLo) * 1].slice(0, 3);

    let direction = 'maintaining';
    let dirTone = 'maint';
    if (slopePerWeek < -0.15) { direction = 'losing';  dirTone = 'down'; }
    if (slopePerWeek >  0.15) { direction = 'gaining'; dirTone = 'up';   }

    return `
      <section class="card wtrend">
        <header class="row row--between">
          <div>
            <p class="card__eyebrow">Weight Trend</p>
            <h2 class="card__title">${within.length} log${within.length === 1 ? '' : 's'} · last 60 days</h2>
          </div>
          <span class="wtrend__slope-pill wtrend__slope-pill--${dirTone} tnum">
            ${slopePerWeek === 0 ? '0' : (slopePerWeek > 0 ? '+' : '')}${slopePerWeek.toFixed(2)} lbs/wk
          </span>
        </header>

        <div class="wtrend__chart-wrap">
          <svg class="wtrend__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="wtrendLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"  stop-color="#00B89E"/>
                <stop offset="100%" stop-color="#4FFBE0"/>
              </linearGradient>
            </defs>
            <!-- Y grid -->
            ${tickYs.map((v) => {
              const y = sy(v);
              return `
                <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
                <text x="${padL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(213,229,235,0.5)" font-weight="700">${v.toFixed(0)}</text>
              `;
            }).join('')}

            <!-- Regression line -->
            ${fit ? `
              <line x1="${sx(0).toFixed(1)}" y1="${sy(lineY1).toFixed(1)}"
                    x2="${sx(days).toFixed(1)}" y2="${sy(lineY2).toFixed(1)}"
                    stroke="url(#wtrendLine)" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 3" opacity="0.85"/>
            ` : ''}

            <!-- Scatter points -->
            ${points.map((p) => `
              <circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3" fill="#4FFBE0" stroke="#001210" stroke-width="1.2"/>
            `).join('')}

            <!-- X axis labels: earliest + latest -->
            <text x="${padL.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="start" font-size="9" fill="rgba(213,229,235,0.55)" font-weight="700">${fmtMonthDay(earliestDate)}</text>
            <text x="${(W - padR).toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="end" font-size="9" fill="#4FFBE0" font-weight="700">${fmtMonthDay(latestDate)}</text>
          </svg>
        </div>

        <p class="wtrend__direction wtrend__direction--${dirTone}">
          <strong>${direction[0].toUpperCase() + direction.slice(1)}</strong> ·
          ${slopePerWeek === 0 ? 'flat trajectory' :
            `${Math.abs(slopePerWeek).toFixed(2)} lbs/wk based on ${within.length} data points`}
        </p>
      </section>
    `;
  }

  /* ---------- 14-day Nutrition Adherence ---------- */
  function tplNutrition(state) {
    const today = SHREDDED.DateUtil.todayYMD();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const ymd = addDaysYMD(today, -i);
      const consumed = consumedOn(state, ymd);
      const target = targetForDate(state, ymd);
      let tone = 'idle';
      if (consumed > 0) {
        if (target == null) tone = 'logged';
        else {
          const ratio = consumed / target;
          if (ratio >= 0.9 && ratio <= 1.1) tone = 'good';
          else tone = 'off';
        }
      }
      days.push({ ymd, consumed, target, tone });
    }
    const hits = days.filter((d) => d.tone === 'good').length;
    // Streak: count back from today while tone === 'good'
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].tone === 'good') streak++;
      else break;
    }
    return `
      <section class="card nut">
        <header class="row row--between">
          <div>
            <p class="card__eyebrow">Nutrition Adherence</p>
            <h2 class="card__title">Last 14 days</h2>
          </div>
          <span class="muted" style="font-size:11px; font-weight:700; letter-spacing:0.04em;">±10% of target</span>
        </header>
        <div class="nut__strip">
          ${days.map((d) => `
            <div class="nut__day nut__day--${d.tone}" title="${fmtMonthDay(d.ymd)}: ${d.consumed.toFixed(0)} kcal${d.target ? ' / ' + d.target : ''}">
              <span class="nut__day-letter">${fmtDayLetter(d.ymd)}</span>
              <span class="nut__day-dot"></span>
            </div>
          `).join('')}
        </div>
        <div class="nut__foot">
          <span class="nut__foot-stat">
            <span class="tnum">${hits}</span><span class="muted">/14</span> hit target
          </span>
          <span class="nut__foot-stat ${streak > 0 ? 'is-streak' : ''}">
            🔥 <span class="tnum">${streak}</span>-day streak
          </span>
        </div>
      </section>
    `;
  }

  /* ---------- Plateau / 1RM table ---------- */
  function tplPlateau(state) {
    const items = exerciseProgressList(state);
    if (items.length === 0) {
      return `
        <section class="card plateau">
          <p class="card__eyebrow">1RM Tracker</p>
          <h2 class="card__title">No exercises logged yet</h2>
          <p class="muted" style="font-size:13px; margin-top:6px;">Log a few sets in the Lift tab and Brzycki e1RM trends will appear here.</p>
        </section>
      `;
    }
    const plateauCount = items.filter((i) => i.plateau).length;
    return `
      <section class="card plateau">
        <header class="row row--between">
          <div>
            <p class="card__eyebrow">1RM Tracker</p>
            <h2 class="card__title">Brzycki e1RM</h2>
          </div>
          ${plateauCount > 0 ? `<span class="plateau__count tnum">${plateauCount} plateau</span>` : ''}
        </header>
        <ul class="plateau__list">
          ${items.map((it) => {
            const trend = it.status;
            const arrow = trend === 'progressing' ? '↑' : trend === 'plateau' ? '→' : trend === 'regressing' ? '↓' : '·';
            const sub =
              trend === 'plateau'    ? `Plateau · ${it.last3.length} sessions @ ${Math.round(it.last3[0].topE1RM)}–${Math.round(Math.max(...it.last3.map((s) => s.topE1RM)))}` :
              trend === 'progressing'? `+${it.delta?.toFixed(1)} lbs over last 3 sessions` :
              trend === 'regressing' ? `${it.delta?.toFixed(1)} lbs over last 3 sessions` :
                                       `Building baseline · ${it.sessions.length} session${it.sessions.length === 1 ? '' : 's'}`;
            return `
              <li class="plateau-item plateau-item--${trend}">
                <div class="plateau-item__main">
                  <span class="plateau-item__name">${it.name}</span>
                  <span class="plateau-item__sub">${sub}</span>
                </div>
                <div class="plateau-item__nums">
                  <span class="plateau-item__num tnum">${it.currentE1RM}</span>
                  <span class="plateau-item__unit">lbs</span>
                  <span class="plateau-item__arrow plateau-item__arrow--${trend}">${arrow}</span>
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      </section>
    `;
  }

  /* ---------- Citations ---------- */
  function tplCitations() {
    const refs = [
      { tag: 'PROTEIN',  authors: 'Helms, Aragon, Fitschen', year: '2014', title: 'Evidence-based recommendations for natural bodybuilding contest preparation', journal: 'J Int Soc Sports Nutr', detail: '1.6–2.2 g/kg/day in caloric deficit' },
      { tag: 'VOLUME',   authors: 'Schoenfeld, Ogborn, Krieger', year: '2017', title: 'Dose–response relationship between weekly resistance training volume and increases in muscle mass', journal: 'J Sports Sci', detail: '10+ sets per muscle/week, dose-dependent' },
      { tag: 'BMR',      authors: 'Mifflin, St Jeor, et al.', year: '1990', title: 'A new predictive equation for resting energy expenditure in healthy individuals', journal: 'Am J Clin Nutr', detail: '10·kg + 6.25·cm − 5·age + sex constant' },
      { tag: 'e1RM',     authors: 'Brzycki', year: '1993', title: 'Strength testing — predicting a one-rep max from reps-to-fatigue', journal: 'JOPERD', detail: 'w · (36 / (37 − r)) — accurate at r ≤ 10' }
    ];
    return `
      <section class="card cites">
        <p class="card__eyebrow">Methods</p>
        <h2 class="card__title">Science behind the numbers</h2>
        <ul class="cites__list">
          ${refs.map((r) => `
            <li class="cite">
              <span class="cite__tag">${r.tag}</span>
              <div class="cite__main">
                <span class="cite__title">${r.title}</span>
                <span class="cite__authors">${r.authors} · ${r.year} · <em>${r.journal}</em></span>
                <span class="cite__detail">${r.detail}</span>
              </div>
            </li>
          `).join('')}
        </ul>
      </section>
    `;
  }

  /* ---------------------------------------------------------- */
  /* BIO MODAL                                                   */
  /* ---------------------------------------------------------- */
  function attachHold(btn, fn) {
    let to, iv;
    const start = (e) => { e.preventDefault(); fn(); to = setTimeout(() => { iv = setInterval(fn, 80); }, 400); };
    const end = () => { clearTimeout(to); clearInterval(iv); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
  }

  function openBioModal(state) {
    const Modal = SHREDDED.Modal;
    if (!Modal) return;
    const bio = getUserBio(state);
    const html = `
      <div class="bio-modal">
        <p class="card__eyebrow">Bio</p>
        <h2 class="bio-modal__title">Mifflin-St Jeor inputs</h2>
        <p class="muted" style="font-size:12.5px; margin:0 0 14px;">Used to compute BMR/TDEE.</p>

        <div class="body-form__rows">
          <div class="body-row">
            <label class="body-row__label">Height</label>
            <div class="spin" data-spin-field="cm" data-spin-step="1" data-spin-decimals="0" data-spin-min="120" data-spin-max="220" data-spin-value="${bio.heightCm}">
              <button class="spin__btn" data-spin-act="dec"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
              <div class="spin__value"><span class="spin__num tnum" data-spin-display>${bio.heightCm}</span><span class="spin__unit">cm</span></div>
              <button class="spin__btn" data-spin-act="inc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
          <div class="body-row">
            <label class="body-row__label">Age</label>
            <div class="spin" data-spin-field="age" data-spin-step="1" data-spin-decimals="0" data-spin-min="13" data-spin-max="100" data-spin-value="${bio.ageYears}">
              <button class="spin__btn" data-spin-act="dec"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
              <div class="spin__value"><span class="spin__num tnum" data-spin-display>${bio.ageYears}</span><span class="spin__unit">years</span></div>
              <button class="spin__btn" data-spin-act="inc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>

        <div class="bio-modal__sex">
          <label class="bio-modal__sex-label">Sex</label>
          <div class="seg-pair">
            <button class="seg-btn ${bio.sex === 'male' ? 'is-active' : ''}" data-bio-sex="male">Male</button>
            <button class="seg-btn ${bio.sex === 'female' ? 'is-active' : ''}" data-bio-sex="female">Female</button>
          </div>
        </div>

        <button class="btn btn--primary" data-bio-save style="width:100%; margin-top:18px;">Save</button>
      </div>
    `;
    Modal.open(html);
    const root = Modal.root;
    let chosenSex = bio.sex;

    // Wire spinners
    root.querySelectorAll('.spin').forEach((spin) => {
      const step = +spin.dataset.spinStep;
      const min = +spin.dataset.spinMin;
      const max = +spin.dataset.spinMax;
      const display = spin.querySelector('[data-spin-display]');
      const apply = (delta) => {
        let v = +spin.dataset.spinValue + delta;
        v = Math.max(min, Math.min(max, v));
        spin.dataset.spinValue = v;
        display.textContent = v;
        SHREDDED.Haptic.tick();
      };
      attachHold(spin.querySelector('[data-spin-act="dec"]'), () => apply(-step));
      attachHold(spin.querySelector('[data-spin-act="inc"]'), () => apply(+step));
    });

    // Wire sex toggle
    root.querySelectorAll('[data-bio-sex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chosenSex = btn.dataset.bioSex;
        root.querySelectorAll('[data-bio-sex]').forEach((b) => b.classList.toggle('is-active', b === btn));
        SHREDDED.Haptic.tick();
      });
    });

    root.querySelector('[data-bio-save]').addEventListener('click', () => {
      const cm = +root.querySelector('.spin[data-spin-field="cm"]').dataset.spinValue;
      const age = +root.querySelector('.spin[data-spin-field="age"]').dataset.spinValue;
      state.mutate((d) => {
        d.userBio = d.userBio || {};
        d.userBio.heightCm = cm;
        d.userBio.ageYears = age;
        d.userBio.sex = chosenSex;
        if (d.userBio.activityMultiplier == null) d.userBio.activityMultiplier = 1.55;
      }, { path: 'userBio' });
      SHREDDED.Toast.show('Bio updated', { tone: 'good' });
      SHREDDED.Haptic.success();
      Modal.close();
    });
  }

  /* ---------------------------------------------------------- */
  /* WIRING                                                      */
  /* ---------------------------------------------------------- */
  function wire(state, view) {
    view.querySelector('[data-bio-edit]')?.addEventListener('click', () => openBioModal(state));
    view.querySelectorAll('[data-mult]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = parseFloat(btn.dataset.mult);
        state.mutate((d) => {
          d.userBio = d.userBio || {};
          d.userBio.activityMultiplier = m;
        }, { path: 'userBio' });
        SHREDDED.Haptic.tick();
      });
    });
  }

  function render(state, view) {
    view.innerHTML = tplStats(state);
    wire(state, view);
  }

  /* ---------------------------------------------------------- */
  /* MOUNT                                                       */
  /* ---------------------------------------------------------- */
  App.register('stats', {
    mount(state) {
      const view = document.querySelector('[data-view="stats"] .view__body');
      if (!view) { console.error('[stats] view body missing'); return; }
      render(state, view);
      state.subscribe(({ path }) => {
        if (!path) return;
        const all = path === '*';
        // Stats reads from nearly everywhere — re-render on any meaningful change
        if (all
          || path.startsWith('userBio')
          || path.startsWith('body')
          || path.startsWith('workouts')
          || path.startsWith('meals')
          || path.startsWith('program')
          || path.startsWith('prs')) {
          render(state, view);
        }
      });
    }
  });
})();