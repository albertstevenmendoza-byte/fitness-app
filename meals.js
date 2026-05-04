## /* ============================================================
SHREDDED — Meals Tab Module (Phase 4)

Surfaces: Prep Guide bar, Fridge Freshness Tracker, SVG Macro
Ring, 4 expandable meal cards with option tabs + week
additions, and USDA Food Search.
============================================================ */
(function () {
‘use strict’;

const App        = window.SHREDDED_APP;
const MEALS      = window.SHREDDED_MEALS;
const PREP_GUIDE = window.SHREDDED_PREP_GUIDE;
if (!App || !MEALS) { console.error(’[meals] deps missing’); return; }

const SLOTS = [‘5am’, ‘9am’, ‘1pm’, ‘6pm’];
const USDA_DEFAULT_KEY = ‘DEMO_KEY’;

/* ––––––––––––––––––––––––––––– */
/* MACRO MATH                                                  */
/* ––––––––––––––––––––––––––––– */

// Daily macro targets — kcal from ramp, p/f from body weight, c is remainder.
function dailyTargets(state) {
const program = state.get(‘program’);
const today = SHREDDED.DateUtil.todayYMD();
const week = SHREDDED.DateUtil.programWeek(program.startDate, program.calorieRamp.totalWeeks, today);
const ramp = program.calorieRamp;
const kcal = Math.min(ramp.ceiling, ramp.base + ramp.stepPerWeek * (week - 1));
const bodyArr = state.get(‘body’) || [];
const lastBody = bodyArr.length ? bodyArr.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
const weightLbs = lastBody?.weight ?? program.stats.startWeightLbs;
const kg = weightLbs / 2.2046;
const proteinG = Math.round(kg * 1.9);
const fatG = Math.round(kg * 0.8);
const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
return { kcal, p: proteinG, c: carbsG, f: fatG, week };
}

// Sum macros across an option’s ingredients
function sumIngredients(ingredients) {
return ingredients.reduce((acc, i) => ({
kcal: acc.kcal + (i.kcal || 0),
p: acc.p + (i.p || 0),
c: acc.c + (i.c || 0),
f: acc.f + (i.f || 0)
}), { kcal: 0, p: 0, c: 0, f: 0 });
}

// Total macros for a meal at week N (option base + weekly addition)
function mealTotals(slotData, optIdx, week) {
const opt = slotData.options[optIdx];
if (!opt) return { kcal: 0, p: 0, c: 0, f: 0 };
const base = sumIngredients(opt.ingredients);
const adj = slotData.weekly?.[week - 1];
if (!adj) return base;
return {
kcal: base.kcal + adj.kcal,
p: base.p + (adj.p || 0),
c: base.c + (adj.c || 0),
f: base.f + (adj.f || 0)
};
}

// Daily consumed macros — checked meals + USDA additions
function dailyConsumed(state) {
const today = SHREDDED.DateUtil.todayYMD();
const m = state.get(`meals.${today}`) || { selections: {}, checked: {}, usda: [] };
const targets = dailyTargets(state);
let totals = { kcal: 0, p: 0, c: 0, f: 0 };
for (const slot of SLOTS) {
if (!m.checked?.[slot]) continue;
const idx = m.selections?.[slot] ?? 0;
const t = mealTotals(MEALS[slot], idx, targets.week);
totals.kcal += t.kcal; totals.p += t.p; totals.c += t.c; totals.f += t.f;
}
for (const u of (m.usda || [])) {
totals.kcal += u.kcal || 0;
totals.p += u.p || 0;
totals.c += u.c || 0;
totals.f += u.f || 0;
}
return totals;
}

/* ––––––––––––––––––––––––––––– */
/* FRIDGE STATUS                                               */
/* ––––––––––––––––––––––––––––– */
function fridgeStatus(cookedOn, today = SHREDDED.DateUtil.todayYMD()) {
if (!cookedOn) return { tone: ‘idle’, label: ‘Not logged’, detail: ‘Tap when cooked’ };
const days = SHREDDED.DateUtil.daysBetween(cookedOn, today);
if (days >= 5) return { tone: ‘discard’, label: ‘Discard’,   detail: `Cooked ${days}d ago — toss.` };
if (days === 4) return { tone: ‘bad’,     label: ‘Eat today’, detail: ‘Day 4 of 5 — last chance.’ };
if (days === 3) return { tone: ‘warn’,    label: ‘Day 3’,     detail: ‘Use within 2 days.’ };
return                  { tone: ‘good’,    label: ‘Fresh’,     detail: `Day ${days + 1} of 5.` };
}

/* ––––––––––––––––––––––––––––– */
/* GROCERY AVAILABILITY                                        */
/* ––––––––––––––––––––––––––––– */
// Returns { ready: bool, missing: [name] } based on grocery state.
// If grocery state is empty (user hasn’t started checklist), returns idle.
// An ingredient is “missing” if its slug isn’t explicitly checked (=== true).
// Slugify strips parenthetical suffixes so “Chicken breast (cooked)” matches “Chicken breast”.
function ingredientsAvailable(state, ingredients) {
const grocery = state.get(‘grocery’) || {};
const keys = Object.keys(grocery);
if (keys.length === 0) return { idle: true };
const slugify = (SHREDDED.slugify) || ((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ‘-’).replace(/^-|-$/g, ‘’));
const missing = [];
for (const ing of ingredients) {
if (ing.freshGrab) continue;          // pantry-fresh, assumed available
const slug = slugify(ing.name);
if (grocery[slug] !== true) missing.push(ing.name);
}
return { ready: missing.length === 0, missing };
}

/* ––––––––––––––––––––––––––––– */
/* WORKOUT-TIME → MEAL TAG MAPPING                             */
/* ––––––––––––––––––––––––––––– */
// “5:00 AM” → minutes since midnight
function timeToMinutes(timeStr) {
if (!timeStr) return null;
const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
if (!m) return null;
let h = parseInt(m[1], 10);
const mins = parseInt(m[2], 10);
const meridiem = m[3]?.toUpperCase();
if (meridiem === ‘AM’) { if (h === 12) h = 0; }
else if (meridiem === ‘PM’) { if (h !== 12) h += 12; }
return h * 60 + mins;
}

// Returns workout time for a given date — per-day override, falling back to default.
// Returns null for rest days (explicitly flagged) or unset programs.
function workoutTimeForDate(state, ymd) {
const dayEntry = state.get(`workouts.${ymd}`);
if (dayEntry?.isRest === true) return null;
if (dayEntry?.plannedTime) return dayEntry.plannedTime;
return state.get(‘program.workoutTime’) || null;
}

// Compute tags for each slot based on workout time T:
//   PRE-WO  → latest slot whose time ≤ T
//   POST-WO → earliest slot whose time ≥ T
//   Tiebreak: slot exactly at T → POST (eat after lifting).
// Returns { ‘5am’: ‘PRE-WO’ | ‘POST-WO’ | null, … }
function computeWorkoutTags(workoutTime) {
const out = { ‘5am’: null, ‘9am’: null, ‘1pm’: null, ‘6pm’: null };
const T = timeToMinutes(workoutTime);
if (T == null) return out;
const slotsAsc = SLOTS.map((k) => ({ key: k, mins: timeToMinutes(MEALS[k].time) })).sort((a, b) => a.mins - b.mins);
let preKey = null;
let postKey = null;
// POST: earliest slot with mins >= T
for (const s of slotsAsc) {
if (s.mins >= T) { postKey = s.key; break; }
}
// PRE: latest slot with mins < T (strict — the post-tied slot can’t also be pre)
for (let i = slotsAsc.length - 1; i >= 0; i–) {
if (slotsAsc[i].mins < T) { preKey = slotsAsc[i].key; break; }
}
if (preKey)  out[preKey]  = ‘PRE-WO’;
if (postKey) out[postKey] = ‘POST-WO’;
return out;
}

/* ––––––––––––––––––––––––––––– */
/* TEMPLATES                                                   */
/* ––––––––––––––––––––––––––––– */

function tplMeals(state) {
const today = SHREDDED.DateUtil.todayYMD();
const wTime = workoutTimeForDate(state, today);
const tags = computeWorkoutTags(wTime);
const isRest = state.get(`workouts.${today}.isRest`) === true;
return `<div class="meals"> ${tplPrepGuide()} ${tplWorkoutBanner(state, wTime, isRest)} ${tplFridge(state)} ${tplMacroRing(state)} <div class="meal-list"> ${SLOTS.map((s) => tplMealCard(state, s, tags[s])).join('')} </div> ${tplUsdaSection(state)} </div>`;
}

/* ––––– Workout time banner ––––– */
function tplWorkoutBanner(state, workoutTime, isRest) {
const today = SHREDDED.DateUtil.todayYMD();
const hasOverride = !!state.get(`workouts.${today}.plannedTime`);
const dayLabel = new Date().toLocaleDateString(‘en-US’, { weekday: ‘long’ });
let bodyHtml;
if (isRest) {
bodyHtml = `<div class="wbanner__main"> <span class="wbanner__label">Rest day</span> <span class="wbanner__sub">No PRE/POST tags · macros unchanged</span> </div>`;
} else if (workoutTime) {
bodyHtml = `<div class="wbanner__main"> <span class="wbanner__label">Training at <span class="wbanner__time tnum">${workoutTime}</span> ${hasOverride ? '<span class="wbanner__override">today only</span>' : ''}</span> <span class="wbanner__sub">Tap to adjust meal timing</span> </div>`;
} else {
bodyHtml = `<div class="wbanner__main"> <span class="wbanner__label">No workout time set</span> <span class="wbanner__sub">Tap to assign a training window for accurate PRE/POST tags</span> </div>`;
}
return `<button class="card wbanner ${isRest ? 'wbanner--rest' : workoutTime ? 'wbanner--active' : 'wbanner--idle'}" data-workout-edit type="button"> <span class="wbanner__icon" aria-hidden="true"> ${isRest ?`
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>
`:`
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
</svg>
`} </span> ${bodyHtml} <span class="wbanner__chev" aria-hidden="true">→</span> </button> `;
}

/* ––––– Prep Guide bar (collapsible) ––––– */
function tplPrepGuide() {
const ALL_DAYS = [‘Mon’, ‘Tue’, ‘Wed’, ‘Thu’, ‘Fri’, ‘Sat’, ‘Sun’];
const blocks = [PREP_GUIDE.sunday, PREP_GUIDE.thursday];
return `
<section class="prep" data-prep>
<button class="prep__bar" data-prep-toggle aria-expanded="false">
<span class="prep__icon" aria-hidden="true">
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/>
<rect x="3" y="9" width="18" height="11" rx="2"/>
<path d="M9 13h6"/>
</svg>
</span>
<div class="prep__title-block">
<span class="prep__title">Meal Prep Guide</span>
<span class="prep__sub">2 sessions · covers all 7 days</span>
</div>
<span class="prep__chev" aria-hidden="true">▾</span>
</button>
<div class="prep__body" data-prep-body>

```
      <!-- Cadence rhythm overview -->
      <div class="prep-cadence">
        ${blocks.map((b) => `
          <div class="prep-cadence__row">
            <span class="prep-cadence__badge">${b.dayBadge}</span>
            <span class="prep-cadence__arrow" aria-hidden="true">→</span>
            <div class="prep-cadence__days">
              ${ALL_DAYS.map((day) => `
                <span class="prep-cadence__day ${b.coverage.includes(day) ? 'is-covered' : ''}" title="${day}">${day[0]}</span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Per-block detail -->
      ${blocks.map((b) => `
        <div class="prep-block">
          <header class="prep-block__head">
            <span class="prep-block__badge">${b.dayBadge}</span>
            <div class="prep-block__title-block">
              <h3 class="prep-block__name">${b.label}</h3>
              <p class="prep-block__sub">for <strong>${b.forDays}</strong> · ${b.cookCount}</p>
            </div>
          </header>
          <ol class="prep-steps">
            ${b.steps.map((s, i) => `
              <li class="prep-step">
                <span class="prep-step__num tnum">${String(i + 1).padStart(2, '0')}</span>
                <div class="prep-step__body">
                  <span class="prep-step__name">${s.what}</span>
                  <span class="prep-step__qty">${s.qty}</span>
                  <span class="prep-step__method">${s.method}</span>
                </div>
              </li>
            `).join('')}
          </ol>
          <div class="prep-block__assembly">
            <span class="prep-block__assembly-tag">ASSEMBLE</span>
            <span class="prep-block__assembly-text">${b.assemble}</span>
          </div>
        </div>
      `).join('')}

      <!-- Food safety callout -->
      <aside class="prep-safety">
        <span class="prep-safety__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l9 16H3z"/>
            <path d="M12 9v5"/>
            <path d="M12 17h.01"/>
          </svg>
        </span>
        <div class="prep-safety__main">
          <span class="prep-safety__tag">Food safety</span>
          <p class="prep-safety__text">${PREP_GUIDE.safety}</p>
        </div>
      </aside>

    </div>
  </section>
`;
```

}

/* ––––– Fridge tracker ––––– */
function tplFridge(state) {
const today = SHREDDED.DateUtil.todayYMD();
const items = [
{ id: ‘chicken’,      name: ‘Chicken’ },
{ id: ‘turkey’,       name: ‘Turkey’ },
{ id: ‘rice’,         name: ‘Rice’ },
{ id: ‘sweetPotato’,  name: ‘Sweet Potato’ }
];
return ` <section class="card fridge"> <header class="row row--between fridge__head"> <div> <p class="card__eyebrow">Fridge Freshness</p> <h2 class="card__title">Cook dates</h2> </div> </header> <div class="fridge__grid"> ${items.map((it) => { const cookedOn = state.get(`fridge.${it.id}`); const s = fridgeStatus(cookedOn, today); return `
<button class="fridge-item fridge-item--${s.tone}" data-fridge="${it.id}">
<div class="fridge-item__name">${it.name}</div>
<div class="fridge-item__badge">${s.label}</div>
<div class="fridge-item__detail">${s.detail}</div>
</button>
`; }).join('')} </div> </section> `;
}

/* ––––– Macro Ring (SVG hero) ––––– */
function tplMacroRing(state) {
const t = dailyTargets(state);
const c = dailyConsumed(state);
const pct = t.kcal > 0 ? Math.min(1, c.kcal / t.kcal) : 0;
const R = 96;
const CIRC = 2 * Math.PI * R; // ~603
const offset = CIRC * (1 - pct);

```
const macroPill = (label, cur, tgt, hue) => {
  const p = tgt > 0 ? Math.min(1, cur / tgt) : 0;
  return `
    <div class="macro-pill" data-hue="${hue}">
      <div class="macro-pill__head">
        <span class="macro-pill__label">${label}</span>
        <span class="macro-pill__nums tnum">
          <span class="macro-pill__cur">${Math.round(cur)}</span>
          <span class="macro-pill__sep">/</span>
          <span class="macro-pill__tgt">${tgt}g</span>
        </span>
      </div>
      <div class="macro-pill__bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
    </div>
  `;
};

return `
  <section class="card ring-card">
    <p class="card__eyebrow">Today · Wk ${t.week}</p>
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stop-color="#00B89E"/>
            <stop offset="100%" stop-color="#4FFBE0"/>
          </linearGradient>
          <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="110" cy="110" r="${R}"
          fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="18" />
        <circle cx="110" cy="110" r="${R}" class="ring__fg"
          fill="none" stroke="url(#ringGrad)" stroke-width="18" stroke-linecap="round"
          stroke-dasharray="${CIRC.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 110 110)"
          filter="url(#ringGlow)" />
      </svg>
      <div class="ring__center">
        <span class="ring__cur tnum">${Math.round(c.kcal).toLocaleString()}</span>
        <span class="ring__div">/</span>
        <span class="ring__tgt tnum">${t.kcal.toLocaleString()}</span>
        <span class="ring__unit">kcal</span>
      </div>
    </div>
    <div class="macro-pills">
      ${macroPill('Protein', c.p, t.p, 'p')}
      ${macroPill('Carbs',   c.c, t.c, 'c')}
      ${macroPill('Fat',     c.f, t.f, 'f')}
    </div>
  </section>
`;
```

}

/* ––––– Meal Card (collapsed → expanded) ––––– */
function tplMealCard(state, slotKey, tag) {
const slot = MEALS[slotKey];
const today = SHREDDED.DateUtil.todayYMD();
const m = state.get(`meals.${today}`) || { selections: {}, checked: {} };
const week = dailyTargets(state).week;

```
// Auto-prefer first available option if grocery state is non-empty and current pick is missing
let optIdx = m.selections?.[slotKey] ?? 0;
const firstReady = pickFirstReady(state, slot);
if (!m.selections?.[slotKey] && firstReady != null) optIdx = firstReady;

const opt = slot.options[optIdx];
const totals = mealTotals(slot, optIdx, week);
const isChecked = !!m.checked?.[slotKey];

// Fridge status for this option
const proteinId = opt.fridgeProtein || slot.fridgeProtein;
const fStat = proteinId ? fridgeStatus(state.get(`fridge.${proteinId}`)) : null;

// Grocery availability
const avail = ingredientsAvailable(state, opt.ingredients);
const adj = slot.weekly?.[week - 1];

return `
  <article class="meal" data-meal="${slotKey}" ${isChecked ? 'data-eaten="1"' : ''}>
    <button class="meal__head" data-meal-toggle aria-expanded="false">
      <div class="meal__time-col">
        <span class="meal__time tnum">${slot.time}</span>
        <span class="meal__label">${slot.label}</span>
        ${tag ? `<span class="meal__tag meal__tag--${tag.toLowerCase().replace('-', '')}">${tag}</span>` : ''}
      </div>
      <div class="meal__main">
        <h3 class="meal__name">${opt.name}</h3>
        <p class="meal__macros">
          <span class="tnum">${Math.round(totals.kcal)}</span> kcal
          <span class="meal__sep">·</span>
          <span class="tnum">${Math.round(totals.p)}</span> g protein
        </p>
        <div class="meal__chips">
          ${fStat ? `<span class="chip chip--fridge chip--${fStat.tone}">${fStat.label}</span>` : ''}
          ${avail.idle
            ? ''
            : avail.ready
              ? `<span class="chip chip--ready">Ready</span>`
              : `<span class="chip chip--missing">Missing ${avail.missing.length}</span>`}
          ${isChecked ? `<span class="chip chip--eaten">✓ Eaten</span>` : ''}
        </div>
      </div>
      <span class="meal__chev" aria-hidden="true">▾</span>
    </button>

    <div class="meal__body" data-meal-body>
      <div class="meal__tabs" role="tablist">
        ${slot.options.map((o, i) => {
          const ok = ingredientsAvailable(state, o.ingredients);
          const active = i === optIdx;
          return `
            <button class="meal__tab ${active ? 'is-active' : ''}"
              data-meal-opt="${i}" role="tab" aria-selected="${active}">
              <span class="meal__tab-i">0${i + 1}</span>
              <span class="meal__tab-name">${o.name}</span>
              ${ok.idle ? '' : ok.ready ? '<span class="meal__tab-dot meal__tab-dot--ok" aria-hidden="true"></span>' : '<span class="meal__tab-dot meal__tab-dot--no" aria-hidden="true"></span>'}
            </button>
          `;
        }).join('')}
      </div>

      <ul class="ing-list">
        ${opt.ingredients.map((ing) => `
          <li class="ing">
            <span class="ing__name">${ing.name}${ing.freshGrab ? ' <span class="ing__fresh">fresh</span>' : ''}</span>
            <span class="ing__grams tnum">${ing.grams} g</span>
            <span class="ing__macros tnum">${ing.kcal} · ${ing.p}p · ${ing.c}c · ${ing.f}f</span>
          </li>
        `).join('')}
      </ul>

      ${adj ? `
        <div class="week-adj">
          <span class="week-adj__tag">WK ${week}</span>
          <span class="week-adj__label">${adj.label}</span>
          <span class="week-adj__delta tnum">+${adj.kcal} kcal</span>
        </div>` : `
        <div class="week-adj week-adj--idle">
          <span class="week-adj__tag">WK ${week}</span>
          <span class="week-adj__label">No additions this week</span>
        </div>`}

      <div class="meal__totals">
        <div class="meal__totals-row">
          <span class="meal__totals-label">Total</span>
          <span class="tnum"><strong>${Math.round(totals.kcal)}</strong> kcal</span>
        </div>
        <div class="meal__totals-macros">
          <span><span class="tnum">${Math.round(totals.p)}</span>g P</span>
          <span><span class="tnum">${Math.round(totals.c)}</span>g C</span>
          <span><span class="tnum">${Math.round(totals.f)}</span>g F</span>
        </div>
      </div>

      ${avail.idle ? '' : avail.ready ? '' : `
        <div class="missing-strip">
          <span class="missing-strip__tag">MISSING</span>
          ${avail.missing.map((n) => `<span class="missing-strip__chip">${n}</span>`).join('')}
        </div>`}

      <button class="btn btn--primary meal__eat" data-meal-eat>
        ${isChecked ? `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          <span>Eaten · Tap to undo</span>` : `
          <span>Mark as Eaten</span>`}
      </button>
    </div>
  </article>
`;
```

}

function pickFirstReady(state, slot) {
const grocery = state.get(‘grocery’) || {};
if (Object.keys(grocery).length === 0) return null;
for (let i = 0; i < slot.options.length; i++) {
const ok = ingredientsAvailable(state, slot.options[i].ingredients);
if (ok.ready) return i;
}
return null;
}

/* ––––– USDA Search section ––––– */
function tplUsdaSection(state) {
const today = SHREDDED.DateUtil.todayYMD();
const usda = state.get(`meals.${today}.usda`) || [];
return `
<section class="card usda">
<header class="row row--between">
<div>
<p class="card__eyebrow">Custom additions</p>
<h2 class="card__title">USDA Food Search</h2>
</div>
<button class="usda__settings" data-usda-key aria-label="API key">
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="3"/>
<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
</svg>
</button>
</header>
<form class="usda__form" data-usda-form>
<input type="search" class="usda__input" placeholder="Search 300k+ foods…" data-usda-input enterkeyhint="search" autocomplete="off" />
<button type="submit" class="usda__go" aria-label="Search">
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
</button>
</form>
<div class="usda__results" data-usda-results></div>

```
    ${usda.length ? `
      <div class="usda__log">
        <p class="usda__log-title">Today's additions</p>
        ${usda.map((u) => `
          <div class="usda-row" data-usda-id="${u.id}">
            <div class="usda-row__main">
              <span class="usda-row__name">${u.name}</span>
              <span class="usda-row__meta tnum">${u.grams}g · ${Math.round(u.kcal)} kcal · ${Math.round(u.p)}p / ${Math.round(u.c)}c / ${Math.round(u.f)}f</span>
            </div>
            <button class="usda-row__del" data-usda-del="${u.id}" aria-label="Remove">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M6 18 18 6"/></svg>
            </button>
          </div>
        `).join('')}
      </div>` : ''}
  </section>
`;
```

}

/* ––––––––––––––––––––––––––––– */
/* USDA — fetch + result modal                                 */
/* ––––––––––––––––––––––––––––– */
function getApiKey(state) {
return state.get(‘usdaApiKey’) || USDA_DEFAULT_KEY;
}

async function usdaSearch(query, apiKey) {
const url = new URL(‘https://api.nal.usda.gov/fdc/v1/foods/search’);
url.searchParams.set(‘api_key’, apiKey);
url.searchParams.set(‘query’, query);
url.searchParams.set(‘pageSize’, ‘20’);
url.searchParams.set(‘dataType’, ‘Foundation,SR Legacy’);
const res = await fetch(url.toString());
if (!res.ok) {
const text = await res.text().catch(() => ‘’);
throw new Error(`USDA ${res.status}: ${text.slice(0, 120)}`);
}
return res.json();
}

function macrosFromFood(food) {
const find = (id) => {
const n = food.foodNutrients?.find((x) => x.nutrientId === id);
return n?.value || 0;
};
return {
kcal: find(1008),       // per 100 g
p:    find(1003),
f:    find(1004),
c:    find(1005)
};
}

function renderUsdaResults(view, foods) {
const wrap = view.querySelector(’[data-usda-results]’);
if (!foods || foods.length === 0) {
wrap.innerHTML = `<div class="usda__empty">No matches. Try a simpler term (e.g. “chicken breast”).</div>`;
return;
}
wrap.innerHTML = foods.map((f) => {
const m = macrosFromFood(f);
return `<button class="usda-hit" data-usda-pick='${encodeURIComponent(JSON.stringify({ fdcId: f.fdcId, description: f.description, m }))}'> <div class="usda-hit__name">${f.description}</div> <div class="usda-hit__macros tnum">${Math.round(m.kcal)} kcal · ${Math.round(m.p)}p / ${Math.round(m.c)}c / ${Math.round(m.f)}f <span class="usda-hit__per">per 100 g</span></div> </button>`;
}).join(’’);
}

function openServingModal(state, hit) {
const Modal = SHREDDED.Modal;
if (!Modal) { console.error(’[meals] Modal helper missing’); return; }
const html = `
<div class="serving">
<p class="card__eyebrow">Add to today</p>
<h2 class="serving__name">${hit.description}</h2>
<p class="serving__base tnum muted">${Math.round(hit.m.kcal)} kcal · ${Math.round(hit.m.p)}p / ${Math.round(hit.m.c)}c / ${Math.round(hit.m.f)}f <span class="muted">per 100 g</span></p>

```
    <div class="logger__spinners" style="margin-top:18px;">
      <div class="spin" data-spin-field="g" data-spin-step="10" data-spin-decimals="0" data-spin-value="100">
        <button class="spin__btn" data-spin-act="dec" aria-label="-10g">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>
        </button>
        <div class="spin__value">
          <span class="spin__num tnum" data-spin-display>100</span>
          <span class="spin__unit">grams</span>
        </div>
        <button class="spin__btn" data-spin-act="inc" aria-label="+10g">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>

    <div class="serving__preview">
      <span class="serving__preview-label">Will add</span>
      <span class="serving__preview-num tnum" data-serving-preview>${Math.round(hit.m.kcal)} kcal · ${Math.round(hit.m.p)}p / ${Math.round(hit.m.c)}c / ${Math.round(hit.m.f)}f</span>
    </div>

    <button class="btn btn--primary" data-serving-add>Add to today</button>
  </div>
`;
Modal.open(html);
const root = Modal.root;
// Wire spinner (uses lift's pattern but inline since we don't import wireSpinners)
const spin = root.querySelector('.spin');
const display = spin.querySelector('[data-spin-display]');
const update = (delta) => {
  let v = parseFloat(spin.dataset.spinValue) + delta;
  v = Math.max(1, Math.min(2000, v));
  spin.dataset.spinValue = v;
  display.textContent = v;
  const factor = v / 100;
  const k = hit.m.kcal * factor, p = hit.m.p * factor, c = hit.m.c * factor, f = hit.m.f * factor;
  root.querySelector('[data-serving-preview]').textContent =
    `${Math.round(k)} kcal · ${Math.round(p)}p / ${Math.round(c)}c / ${Math.round(f)}f`;
  SHREDDED.Haptic.tick();
};
attachHold(spin.querySelector('[data-spin-act="dec"]'), () => update(-10));
attachHold(spin.querySelector('[data-spin-act="inc"]'), () => update(+10));

root.querySelector('[data-serving-add]').addEventListener('click', () => {
  const grams = parseFloat(spin.dataset.spinValue);
  const factor = grams / 100;
  const item = {
    id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fdcId: hit.fdcId,
    name: hit.description,
    grams,
    kcal: hit.m.kcal * factor,
    p:    hit.m.p    * factor,
    c:    hit.m.c    * factor,
    f:    hit.m.f    * factor,
    ts: Date.now()
  };
  const today = SHREDDED.DateUtil.todayYMD();
  state.mutate((d) => {
    d.meals[today] = d.meals[today] || { selections: {}, checked: {}, usda: [] };
    d.meals[today].usda = d.meals[today].usda || [];
    d.meals[today].usda.push(item);
  }, { path: `meals.${today}.usda` });
  SHREDDED.Haptic.success();
  SHREDDED.Toast.show(`Added ${Math.round(item.kcal)} kcal`, { tone: 'good' });
  Modal.close();
});
```

}

function openApiKeyModal(state) {
const Modal = SHREDDED.Modal;
const cur = state.get(‘usdaApiKey’) || ‘’;
const html = `<div class="api-modal"> <p class="card__eyebrow">USDA FoodData Central</p> <h2 class="api-modal__title">API Key</h2> <p class="api-modal__desc">Free at <span class="muted">api.data.gov</span>. Default <span class="tnum">DEMO_KEY</span> works but is rate-limited (1000/hr per IP). Paste your own for unlimited use.</p> <input class="api-modal__input" type="text" placeholder="Paste API key" data-api-input value="${cur}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" /> <div class="api-modal__actions"> <button class="btn api-modal__clear" data-api-clear>Use Default</button> <button class="btn btn--primary" data-api-save>Save</button> </div> </div>`;
Modal.open(html);
const root = Modal.root;
root.querySelector(’[data-api-save]’).addEventListener(‘click’, () => {
const val = root.querySelector(’[data-api-input]’).value.trim();
state.set(‘usdaApiKey’, val || null);
SHREDDED.Toast.show(val ? ‘Key saved’ : ‘Using default’, { tone: ‘good’ });
Modal.close();
});
root.querySelector(’[data-api-clear]’).addEventListener(‘click’, () => {
state.set(‘usdaApiKey’, null);
SHREDDED.Toast.show(‘Using default DEMO_KEY’, { tone: ‘accent’ });
Modal.close();
});
}

function openWorkoutTimeModal(state) {
const Modal = SHREDDED.Modal;
if (!Modal) return;
const today = SHREDDED.DateUtil.todayYMD();
const dayLabel = new Date().toLocaleDateString(‘en-US’, { weekday: ‘long’, month: ‘short’, day: ‘numeric’ });
const def = state.get(‘program.workoutTime’) || ‘17:00’;
const override = state.get(`workouts.${today}.plannedTime`);
const isRest = state.get(`workouts.${today}.isRest`) === true;
const normalize = (t) => {
if (!t) return ‘’;
const m = String(t).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
if (!m) return t;
let h = parseInt(m[1], 10);
const mins = m[2];
if (m[3]) {
if (m[3].toUpperCase() === ‘AM’ && h === 12) h = 0;
else if (m[3].toUpperCase() === ‘PM’ && h !== 12) h += 12;
}
return `${String(h).padStart(2, '0')}:${mins}`;
};
const todayInputVal = normalize(override || def);
const defaultInputVal = normalize(def);

```
const html = `
  <div class="bio-modal wtime-modal">
    <p class="card__eyebrow">Workout Time</p>
    <h2 class="bio-modal__title">When are you training?</h2>
    <p class="muted" style="font-size:12.5px; margin:0 0 14px; line-height:1.45;">
      PRE-WO and POST-WO tags follow your workout time. The closest meal before becomes PRE; closest after becomes POST.
    </p>

    <div class="wtime-section">
      <label class="wtime-section__label">Today (${dayLabel})</label>
      ${isRest ? `
        <div class="wtime-rest-pill">Rest day · no tags will fire</div>
      ` : `
        <input type="time" class="program-setup__date wtime-input" data-wtime-today value="${todayInputVal}" />
      `}
      <div class="wtime-actions">
        <button class="btn wtime-action ${isRest ? 'is-active' : ''}" data-wtime-rest type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span>${isRest ? 'Cancel rest day' : 'Mark as rest day'}</span>
        </button>
        ${override && !isRest ? `
          <button class="btn wtime-action" data-wtime-clear-override type="button">Use default</button>
        ` : ''}
      </div>
    </div>

    <div class="wtime-section">
      <label class="wtime-section__label">Default workout time</label>
      <input type="time" class="program-setup__date wtime-input" data-wtime-default value="${defaultInputVal}" />
      <p class="wtime-section__hint">Used every day unless you override above.</p>
    </div>

    <button class="btn btn--primary" data-wtime-save style="width:100%; margin-top:14px;">Save</button>
  </div>
`;
Modal.open(html);
const root = Modal.root;
let willMarkRest = isRest;

root.querySelector('[data-wtime-rest]')?.addEventListener('click', () => {
  willMarkRest = !willMarkRest;
  const sec = root.querySelector('[data-wtime-rest]').closest('.wtime-section');
  const input = sec.querySelector('[data-wtime-today]');
  const pill = sec.querySelector('.wtime-rest-pill');
  const btn = root.querySelector('[data-wtime-rest]');
  if (willMarkRest) {
    if (input) input.style.display = 'none';
    if (!pill) {
      const p = document.createElement('div');
      p.className = 'wtime-rest-pill';
      p.textContent = 'Rest day · no tags will fire';
      sec.insertBefore(p, sec.querySelector('.wtime-actions'));
    }
    btn.querySelector('span').textContent = 'Cancel rest day';
    btn.classList.add('is-active');
  } else {
    if (input) input.style.display = '';
    if (pill) pill.remove();
    btn.querySelector('span').textContent = 'Mark as rest day';
    btn.classList.remove('is-active');
  }
  SHREDDED.Haptic.tick();
});

root.querySelector('[data-wtime-clear-override]')?.addEventListener('click', () => {
  state.mutate((d) => {
    if (d.workouts?.[today]) {
      delete d.workouts[today].plannedTime;
    }
  }, { path: `workouts.${today}` });
  SHREDDED.Toast.show('Using default workout time', { tone: 'accent' });
  Modal.close();
});

root.querySelector('[data-wtime-save]').addEventListener('click', () => {
  const todayVal = root.querySelector('[data-wtime-today]')?.value;
  const defVal = root.querySelector('[data-wtime-default]')?.value;
  const fmt12 = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, '0')} ${meridiem}`;
  };
  state.mutate((d) => {
    d.program = d.program || {};
    if (defVal) d.program.workoutTime = fmt12(defVal);
    d.workouts = d.workouts || {};
    d.workouts[today] = d.workouts[today] || {};
    if (willMarkRest) {
      d.workouts[today].isRest = true;
      delete d.workouts[today].plannedTime;
    } else {
      delete d.workouts[today].isRest;
      const todayFmt = fmt12(todayVal);
      if (todayFmt && todayFmt !== fmt12(defVal)) {
        d.workouts[today].plannedTime = todayFmt;
      } else {
        delete d.workouts[today].plannedTime;
      }
    }
  }, { path: '*' });
  SHREDDED.Haptic.success();
  SHREDDED.Toast.show(willMarkRest ? 'Marked as rest day' : 'Workout time saved', { tone: 'good' });
  Modal.close();
});
```

}

/* ––––––––––––––––––––––––––––– */
/* WIRING                                                      */
/* ––––––––––––––––––––––––––––– */

// Reused from lift.js pattern, inlined so meals.js stands alone
function attachHold(btn, fn) {
let timeout, interval;
const start = (e) => {
e.preventDefault();
fn();
timeout = setTimeout(() => { interval = setInterval(fn, 80); }, 400);
};
const end = () => { clearTimeout(timeout); clearInterval(interval); };
btn.addEventListener(‘pointerdown’, start);
btn.addEventListener(‘pointerup’, end);
btn.addEventListener(‘pointerleave’, end);
btn.addEventListener(‘pointercancel’, end);
}

function wirePrep(view) {
const sec = view.querySelector(’[data-prep]’);
if (!sec) return;
const btn = sec.querySelector(’[data-prep-toggle]’);
btn.addEventListener(‘click’, () => {
const open = sec.classList.toggle(‘is-open’);
btn.setAttribute(‘aria-expanded’, open ? ‘true’ : ‘false’);
SHREDDED.Haptic.tick();
});
}

function wireFridge(state, view) {
view.querySelectorAll(’[data-fridge]’).forEach((btn) => {
btn.addEventListener(‘click’, () => {
const id = btn.dataset.fridge;
const today = SHREDDED.DateUtil.todayYMD();
const cur = state.get(`fridge.${id}`);
if (cur === today) {
// Tap-again-today → clear
state.mutate((d) => { d.fridge[id] = null; }, { path: `fridge.${id}` });
SHREDDED.Toast.show(`${id}: cleared`, { tone: ‘accent’ });
} else {
state.mutate((d) => { d.fridge[id] = today; }, { path: `fridge.${id}` });
SHREDDED.Toast.show(`${id}: cooked today`, { tone: ‘good’ });
}
SHREDDED.Haptic.bump();
});
});
}

function wireMealCards(state, view) {
view.querySelectorAll(’.meal’).forEach((card) => {
const slotKey = card.dataset.meal;
// Toggle expand
card.querySelector(’[data-meal-toggle]’).addEventListener(‘click’, () => {
const open = card.classList.toggle(‘is-open’);
card.querySelector(’[data-meal-toggle]’).setAttribute(‘aria-expanded’, open ? ‘true’ : ‘false’);
SHREDDED.Haptic.tick();
});
// Option tabs
card.querySelectorAll(’[data-meal-opt]’).forEach((tab) => {
tab.addEventListener(‘click’, () => {
const idx = +tab.dataset.mealOpt;
const today = SHREDDED.DateUtil.todayYMD();
state.mutate((d) => {
d.meals[today] = d.meals[today] || { selections: {}, checked: {}, usda: [] };
d.meals[today].selections = d.meals[today].selections || {};
d.meals[today].selections[slotKey] = idx;
}, { path: `meals.${today}.selections` });
SHREDDED.Haptic.tick();
});
});
// Mark eaten
card.querySelector(’[data-meal-eat]’)?.addEventListener(‘click’, () => {
const today = SHREDDED.DateUtil.todayYMD();
state.mutate((d) => {
d.meals[today] = d.meals[today] || { selections: {}, checked: {}, usda: [] };
d.meals[today].checked = d.meals[today].checked || {};
d.meals[today].checked[slotKey] = !d.meals[today].checked[slotKey];
}, { path: `meals.${today}.checked` });
SHREDDED.Haptic.success();
});
});
}

function wireUsda(state, view) {
const form = view.querySelector(’[data-usda-form]’);
const input = view.querySelector(’[data-usda-input]’);
const results = view.querySelector(’[data-usda-results]’);
const settings = view.querySelector(’[data-usda-key]’);

```
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  results.innerHTML = `<div class="usda__loading"><span class="placeholder__pulse"></span><span>Searching USDA…</span></div>`;
  try {
    const data = await usdaSearch(q, getApiKey(state));
    renderUsdaResults(view, data.foods || []);
  } catch (err) {
    results.innerHTML = `<div class="usda__error">
      <strong>Search failed.</strong> ${String(err.message || err)}
      <br/><span class="muted">Tap the gear to set your own API key, or try a simpler query.</span>
    </div>`;
  }
});

settings.addEventListener('click', () => openApiKeyModal(state));

// Result clicks (delegated)
results.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-usda-pick]');
  if (!btn) return;
  try {
    const hit = JSON.parse(decodeURIComponent(btn.dataset.usdaPick));
    openServingModal(state, hit);
  } catch (err) { console.error(err); }
});

// Delete USDA item
view.querySelectorAll('[data-usda-del]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.usdaDel;
    const today = SHREDDED.DateUtil.todayYMD();
    state.mutate((d) => {
      if (d.meals[today]?.usda) {
        d.meals[today].usda = d.meals[today].usda.filter((u) => u.id !== id);
      }
    }, { path: `meals.${today}.usda` });
    SHREDDED.Haptic.tick();
  });
});
```

}

/* ––––––––––––––––––––––––––––– */
/* RENDER                                                      */
/* ––––––––––––––––––––––––––––– */
function render(state, view) {
// Preserve UI state: which meal cards are open, prep guide open state, search input value
const openMeals = new Set();
view.querySelectorAll(’.meal.is-open’).forEach((c) => openMeals.add(c.dataset.meal));
const prepOpen = view.querySelector(’[data-prep]’)?.classList.contains(‘is-open’) || false;
const usdaQ = view.querySelector(’[data-usda-input]’)?.value || ‘’;
const usdaResults = view.querySelector(’[data-usda-results]’)?.innerHTML || ‘’;

```
view.innerHTML = tplMeals(state);

// Restore
if (prepOpen) {
  const sec = view.querySelector('[data-prep]');
  sec?.classList.add('is-open');
  sec?.querySelector('[data-prep-toggle]')?.setAttribute('aria-expanded', 'true');
}
openMeals.forEach((slot) => {
  const c = view.querySelector(`.meal[data-meal="${slot}"]`);
  c?.classList.add('is-open');
  c?.querySelector('[data-meal-toggle]')?.setAttribute('aria-expanded', 'true');
});
const inp = view.querySelector('[data-usda-input]');
if (inp && usdaQ) inp.value = usdaQ;
const res = view.querySelector('[data-usda-results]');
if (res && usdaResults) res.innerHTML = usdaResults;

// Wire all
wirePrep(view);
wireFridge(state, view);
view.querySelector('[data-workout-edit]')?.addEventListener('click', () => openWorkoutTimeModal(state));
wireMealCards(state, view);
wireUsda(state, view);
```

}

/* ––––––––––––––––––––––––––––– */
/* MOUNT                                                       */
/* ––––––––––––––––––––––––––––– */
App.register(‘meals’, {
mount(state) {
const view = document.querySelector(’[data-view=“meals”] .view__body’);
if (!view) return;
render(state, view);
state.subscribe(({ path }) => {
if (!path) return;
const all = path === ’*’;
if (all
|| path.startsWith(‘meals’)
|| path.startsWith(‘fridge’)
|| path.startsWith(‘grocery’)
|| path.startsWith(‘program’)
|| path.startsWith(‘body’)
|| path.startsWith(‘usdaApiKey’)
) render(state, view);
});

```
  // Day rollover
  let lastDay = SHREDDED.DateUtil.todayYMD();
  setInterval(() => {
    const now = SHREDDED.DateUtil.todayYMD();
    if (now !== lastDay) { lastDay = now; render(state, view); }
  }, 60_000);
}
```

});

})();
