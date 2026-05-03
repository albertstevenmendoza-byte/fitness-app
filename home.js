/* ============================================================
   SHREDDED — Home Tab Module (Phase 2)
   ------------------------------------------------------------
   Mounts into <section data-view="home">.
   Owns: Readiness Check, Calorie Ramp, Phase Hero, Stat Cards,
         Phase Selector, Today at a Glance.
   ============================================================ */
(function () {
  'use strict';

  const App = window.SHREDDED_APP;
  if (!App) { console.error('[home] App shell missing'); return; }

  /* ---------------------------------------------------------- */
  /* PURE HELPERS                                                */
  /* ---------------------------------------------------------- */

  const PHASE_DATA = {
    1: {
      name: 'Reawaken',
      span: 'Wk 1 – 3',
      desc: 'Neuromuscular re-engagement. Movement patterns rebuild faster than tissue.',
      sci:  'Early gains are largely neural — the CNS recruits motor units it had stopped using. Tendon and fascia adapt 4–6 weeks behind muscle, so volume stays moderate and technique stays clean.',
      train: '3-day full body',
      rpe: 'RPE 6 – 7'
    },
    2: {
      name: 'Reload',
      span: 'Wk 4 – 6',
      desc: 'Hypertrophy emphasis. Volume climbs as connective tissue catches up.',
      sci:  'Muscle protein synthesis runs elevated 24–48 h post-session. With protein at 1.9 g/kg and calories tracking BMR, the recomposition window is actively open.',
      train: '4-day upper / lower',
      rpe: 'RPE 7 – 8'
    },
    3: {
      name: 'Refine',
      span: 'Wk 7 – 8',
      desc: 'Strength consolidation. Calorie ceiling, peak intensity.',
      sci:  'Sarcoplasmic gains shift toward myofibrillar density. Higher intensity expresses the strength latent in the muscle already built.',
      train: '4-day upper / lower',
      rpe: 'RPE 8 – 9'
    }
  };

  const calorieForWeek = (week, ramp) =>
    Math.min(ramp.ceiling, ramp.base + ramp.stepPerWeek * (week - 1));

  const phaseFromWeek = (week) => (week <= 3 ? 1 : week <= 6 ? 2 : 3);

  const proteinGrams = (weightLbs, factor = 1.9) =>
    Math.round((weightLbs / 2.2046) * factor);

  const fmtKcal = (n) => n.toLocaleString('en-US');

  function readinessScore(sleep, soreness, drive) {
    return sleep * 0.4 + soreness * 0.3 + drive * 0.3;
  }
  function readinessVerdict(score) {
    if (score >= 4.0) return { label: 'Train hard', tone: 'good', detail: 'Push the top end of the rep range.' };
    if (score >= 2.5) return { label: 'Back off',   tone: 'warn', detail: 'Cut volume ~30%, hold form.' };
    return                       { label: 'Rest',       tone: 'bad',  detail: 'Active recovery only — walk, mobility.' };
  }

  function todayMealsChecked(state, today) {
    const day = state.get(`meals.${today}`);
    if (!day || !day.checked) return { done: 0, total: 4 };
    const done = Object.values(day.checked).filter(Boolean).length;
    return { done, total: 4 };
  }
  function todaySetsLogged(state, today) {
    const day = state.get(`workouts.${today}`);
    if (!day || !day.exercises) return 0;
    let n = 0;
    for (const sets of Object.values(day.exercises)) n += Array.isArray(sets) ? sets.length : 0;
    return n;
  }
  function lastBodyEntry(state) {
    const arr = state.get('body') || [];
    if (!arr.length) return null;
    return arr.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }

  /* Days-ago in words for last weigh-in pill */
  function relativeDay(ymd, today = SHREDDED.DateUtil.todayYMD()) {
    const d = SHREDDED.DateUtil.daysBetween(ymd, today);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7)   return `${d} d ago`;
    return `${Math.floor(d / 7)} w ago`;
  }

  /* ---------------------------------------------------------- */
  /* HTML TEMPLATE                                               */
  /* ---------------------------------------------------------- */
  function tplHome() {
    return `
      <div class="home">

        <!-- READINESS CHECK -->
        <section class="card home__readiness" data-readiness>
          <!-- expanded form -->
          <div class="rd" data-rd-form>
            <div class="row row--between rd__head">
              <div>
                <p class="card__eyebrow">Readiness Check</p>
                <h2 class="card__title">How's the engine?</h2>
              </div>
              <div class="rd__score" data-rd-badge>
                <span class="rd__score-num tnum" data-rd-score>3.0</span>
                <span class="rd__score-tag" data-rd-verdict>—</span>
              </div>
            </div>

            ${[
              { id: 'sleep',    label: 'Sleep',    hint: '1 trash · 5 deep',     w: '40%' },
              { id: 'soreness', label: 'Soreness', hint: '1 wrecked · 5 fresh',  w: '30%' },
              { id: 'drive',    label: 'Drive',    hint: '1 flat · 5 dialed',    w: '30%' }
            ].map((x) => `
              <div class="rd__row">
                <div class="rd__row-head">
                  <span class="rd__label">${x.label}</span>
                  <span class="rd__hint">${x.hint} · ${x.w}</span>
                  <span class="rd__val tnum" data-rd-val="${x.id}">3</span>
                </div>
                <input
                  type="range" min="1" max="5" step="1" value="3"
                  class="rd__slider"
                  data-rd-input="${x.id}"
                  aria-label="${x.label} (1 to 5)"
                />
                <div class="rd__ticks" aria-hidden="true">
                  ${[1,2,3,4,5].map(() => '<span></span>').join('')}
                </div>
              </div>
            `).join('')}

            <button class="btn btn--primary rd__confirm" data-rd-confirm>
              <span>Confirm Readiness</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            </button>
          </div>

          <!-- collapsed pill (post-confirm) -->
          <div class="rd-done" data-rd-done hidden>
            <span class="rd-done__dot" data-rd-done-dot></span>
            <span class="rd-done__num tnum" data-rd-done-num>—</span>
            <span class="rd-done__sep">·</span>
            <span class="rd-done__label" data-rd-done-label>—</span>
            <button class="rd-done__redo" data-rd-redo>Redo</button>
          </div>
        </section>

        <!-- CALORIE RAMP -->
        <section class="card home__ramp">
          <div class="row row--between">
            <div>
              <p class="card__eyebrow">This Week · <span data-ramp-week>Week 1</span></p>
              <h2 class="card__title">
                <span class="metric--xl tnum" data-ramp-kcal>1,500</span>
                <span class="unit">kcal/day</span>
              </h2>
              <p class="card__sub" data-ramp-delta>Base · program start</p>
            </div>
            <div class="ramp__phase-tag" data-ramp-phase>P1</div>
          </div>

          <div class="ramp__timeline" data-ramp-timeline></div>

          <div class="ramp__progress">
            <div class="ramp__progress-track"><div class="ramp__progress-fill" data-ramp-fill></div></div>
            <span class="tnum" data-ramp-pct>0%</span>
          </div>

          <p class="ramp__countdown" data-ramp-countdown>Day 1 of program</p>
          <button class="ramp__setup" data-program-setup type="button">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            <span>Edit start date & baseline</span>
          </button>
        </section>

        <!-- PHASE HERO -->
        <section class="card home__phase">
          <div class="phase__header">
            <span class="phase__num tnum" data-phase-num>01</span>
            <div class="phase__title-block">
              <p class="card__eyebrow" data-phase-span>Wk 1 – 3</p>
              <h2 class="phase__name" data-phase-name>Reawaken</h2>
            </div>
          </div>
          <p class="phase__desc" data-phase-desc>—</p>
          <div class="phase__sci">
            <p class="phase__sci-eye">What's happening</p>
            <p class="phase__sci-body" data-phase-sci>—</p>
          </div>
          <div class="seg" role="radiogroup" aria-label="Phase override" data-phase-seg>
            <button class="seg__opt" role="radio" data-phase="1" aria-checked="true">Phase 1</button>
            <button class="seg__opt" role="radio" data-phase="2" aria-checked="false">Phase 2</button>
            <button class="seg__opt" role="radio" data-phase="3" aria-checked="false">Phase 3</button>
            <span class="seg__thumb" aria-hidden="true"></span>
          </div>
        </section>

        <!-- STAT CARDS 2x2 -->
        <section class="home__stats">
          <div class="stat">
            <div class="stat__head">
              <svg class="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-3.5 2.5-5 4-8z"/></svg>
              <span class="stat__label">Calories</span>
            </div>
            <p class="stat__value"><span class="tnum" data-stat-kcal>1,500</span><span class="unit">kcal</span></p>
          </div>

          <div class="stat">
            <div class="stat__head">
              <svg class="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>
              <span class="stat__label">Protein</span>
            </div>
            <p class="stat__value"><span class="tnum" data-stat-protein>127</span><span class="unit">g</span></p>
          </div>

          <div class="stat">
            <div class="stat__head">
              <svg class="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="3" height="6" rx="1"/><rect x="17" y="9" width="3" height="6" rx="1"/><path d="M7 12h10"/></svg>
              <span class="stat__label">Training</span>
            </div>
            <p class="stat__value stat__value--text" data-stat-train>3-day full body</p>
          </div>

          <div class="stat">
            <div class="stat__head">
              <svg class="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 4 4-7 5 9"/></svg>
              <span class="stat__label">Intensity</span>
            </div>
            <p class="stat__value stat__value--text" data-stat-rpe>RPE 6 – 7</p>
          </div>
        </section>

        <!-- TODAY AT A GLANCE -->
        <section class="card home__glance">
          <p class="card__eyebrow">Today at a Glance</p>
          <div class="glance">
            <div class="glance__item">
              <span class="glance__num tnum" data-glance-meals>0/4</span>
              <span class="glance__label">Meals checked</span>
            </div>
            <div class="glance__sep" aria-hidden="true"></div>
            <div class="glance__item">
              <span class="glance__num tnum" data-glance-sets>0</span>
              <span class="glance__label">Sets logged</span>
            </div>
            <div class="glance__sep" aria-hidden="true"></div>
            <div class="glance__item">
              <span class="glance__num tnum" data-glance-weight>—</span>
              <span class="glance__label" data-glance-weight-when>No weigh-in</span>
            </div>
          </div>
        </section>

      </div>
    `;
  }

  /* ---------------------------------------------------------- */
  /* RENDERERS — read state, mutate DOM in place                 */
  /* ---------------------------------------------------------- */

  function renderReadiness(state, root) {
    const today = SHREDDED.DateUtil.todayYMD();
    const todayRd = state.get(`readiness.${today}`);
    const form = root.querySelector('[data-rd-form]');
    const done = root.querySelector('[data-rd-done]');

    if (todayRd && typeof todayRd.score === 'number') {
      // Collapsed
      form.hidden = true;
      done.hidden = false;
      const v = readinessVerdict(todayRd.score);
      root.querySelector('[data-rd-done-num]').textContent = todayRd.score.toFixed(1);
      const labelEl = root.querySelector('[data-rd-done-label]');
      labelEl.textContent = v.label;
      labelEl.dataset.tone = v.tone;
      const dot = root.querySelector('[data-rd-done-dot]');
      dot.dataset.tone = v.tone;
    } else {
      // Expanded
      form.hidden = false;
      done.hidden = true;
      // sync live badge once on render
      updateLiveScore(root);
    }
  }

  function updateLiveScore(root) {
    const sleep    = +root.querySelector('[data-rd-input="sleep"]').value;
    const soreness = +root.querySelector('[data-rd-input="soreness"]').value;
    const drive    = +root.querySelector('[data-rd-input="drive"]').value;
    const score = readinessScore(sleep, soreness, drive);
    root.querySelector('[data-rd-score]').textContent = score.toFixed(1);
    const v = readinessVerdict(score);
    const verdEl = root.querySelector('[data-rd-verdict]');
    verdEl.textContent = v.label;
    verdEl.dataset.tone = v.tone;
    const badge = root.querySelector('[data-rd-badge]');
    badge.dataset.tone = v.tone;
    // Per-row values
    root.querySelector('[data-rd-val="sleep"]').textContent    = sleep;
    root.querySelector('[data-rd-val="soreness"]').textContent = soreness;
    root.querySelector('[data-rd-val="drive"]').textContent    = drive;
    // Slider fill — set --val custom prop for the gradient track
    ['sleep','soreness','drive'].forEach((id) => {
      const el = root.querySelector(`[data-rd-input="${id}"]`);
      el.style.setProperty('--val', ((+el.value - 1) / 4) * 100 + '%');
    });
  }

  function renderRamp(state, root) {
    const program = state.get('program');
    const today = SHREDDED.DateUtil.todayYMD();
    const week = SHREDDED.DateUtil.programWeek(program.startDate, program.calorieRamp.totalWeeks, today);
    const kcal = calorieForWeek(week, program.calorieRamp);
    const lastWeekKcal = week > 1 ? calorieForWeek(week - 1, program.calorieRamp) : null;
    const delta = lastWeekKcal != null ? kcal - lastWeekKcal : 0;
    const totalDays = program.calorieRamp.totalWeeks * 7;
    const daysIn = Math.max(0, SHREDDED.DateUtil.daysBetween(program.startDate, today));
    const pct = Math.min(100, Math.round((daysIn / totalDays) * 100));
    const daysToNext = SHREDDED.DateUtil.daysUntilNextWeek(program.startDate, today);
    const nextWeek = Math.min(program.calorieRamp.totalWeeks, week + 1);
    const nextKcal = calorieForWeek(nextWeek, program.calorieRamp);
    const phase = phaseFromWeek(week);

    root.querySelector('[data-ramp-week]').textContent  = `Week ${week}`;
    root.querySelector('[data-ramp-kcal]').textContent  = fmtKcal(kcal);
    root.querySelector('[data-ramp-phase]').textContent = `P${phase}`;

    const deltaEl = root.querySelector('[data-ramp-delta]');
    if (week === 1) {
      deltaEl.textContent = 'Base · program start';
      deltaEl.dataset.tone = 'neutral';
    } else if (delta > 0) {
      deltaEl.textContent = `+${delta} from last week`;
      deltaEl.dataset.tone = 'good';
    } else {
      deltaEl.textContent = 'Holding at ceiling';
      deltaEl.dataset.tone = 'neutral';
    }

    // Timeline dots
    const tl = root.querySelector('[data-ramp-timeline]');
    tl.innerHTML = '';
    for (let w = 1; w <= program.calorieRamp.totalWeeks; w++) {
      const dot = document.createElement('div');
      const state = w < week ? 'past' : w === week ? 'current' : 'future';
      dot.className = `tl__dot tl__dot--${state}`;
      dot.innerHTML = `<span class="tl__num tnum">${w}</span>`;
      tl.appendChild(dot);
    }

    // Progress bar
    root.querySelector('[data-ramp-fill]').style.width = pct + '%';
    root.querySelector('[data-ramp-pct]').textContent  = pct + '%';

    // Countdown
    const cd = root.querySelector('[data-ramp-countdown]');
    if (week >= program.calorieRamp.totalWeeks) {
      cd.textContent = `Final week · ${totalDays - daysIn} day${totalDays - daysIn === 1 ? '' : 's'} remaining`;
    } else if (kcal === program.calorieRamp.ceiling && nextKcal === program.calorieRamp.ceiling) {
      cd.textContent = `Ceiling reached · maintaining ${fmtKcal(kcal)} kcal`;
    } else {
      cd.textContent = `Next bump in ${daysToNext} day${daysToNext === 1 ? '' : 's'} → ${fmtKcal(nextKcal)} kcal`;
    }
  }

  function renderPhase(state, root) {
    const phase = state.get('program.currentPhase') || 1;
    const data = PHASE_DATA[phase];
    root.querySelector('[data-phase-num]').textContent  = String(phase).padStart(2, '0');
    root.querySelector('[data-phase-span]').textContent = data.span;
    root.querySelector('[data-phase-name]').textContent = data.name;
    root.querySelector('[data-phase-desc]').textContent = data.desc;
    root.querySelector('[data-phase-sci]').textContent  = data.sci;

    // Segmented control state
    const seg = root.querySelector('[data-phase-seg]');
    seg.style.setProperty('--seg-pos', phase - 1);
    seg.querySelectorAll('.seg__opt').forEach((btn) => {
      const active = +btn.dataset.phase === phase;
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function renderStats(state, root) {
    const program = state.get('program');
    const today = SHREDDED.DateUtil.todayYMD();
    const week = SHREDDED.DateUtil.programWeek(program.startDate, program.calorieRamp.totalWeeks, today);
    const kcal = calorieForWeek(week, program.calorieRamp);
    const phase = state.get('program.currentPhase') || 1;
    const last = lastBodyEntry(state);
    const weightLbs = last && typeof last.weight === 'number' ? last.weight : program.stats.startWeightLbs;

    root.querySelector('[data-stat-kcal]').textContent    = fmtKcal(kcal);
    root.querySelector('[data-stat-protein]').textContent = proteinGrams(weightLbs);
    root.querySelector('[data-stat-train]').textContent   = PHASE_DATA[phase].train;
    root.querySelector('[data-stat-rpe]').textContent     = PHASE_DATA[phase].rpe;
  }

  function renderGlance(state, root) {
    const today = SHREDDED.DateUtil.todayYMD();
    const meals = todayMealsChecked(state, today);
    const sets  = todaySetsLogged(state, today);
    const last  = lastBodyEntry(state);

    root.querySelector('[data-glance-meals]').textContent = `${meals.done}/${meals.total}`;
    root.querySelector('[data-glance-sets]').textContent  = sets;

    const wEl = root.querySelector('[data-glance-weight]');
    const whenEl = root.querySelector('[data-glance-weight-when]');
    if (last) {
      wEl.textContent = last.weight.toFixed(1);
      whenEl.textContent = `${relativeDay(last.date)} · lbs`;
    } else {
      wEl.textContent = '—';
      whenEl.textContent = 'No weigh-in';
    }
  }

  /* ---------------------------------------------------------- */
  /* EVENT WIRING                                                */
  /* ---------------------------------------------------------- */

  function wireReadiness(state, root) {
    // Live drag updates (do NOT write to state mid-drag)
    root.querySelectorAll('[data-rd-input]').forEach((slider) => {
      slider.addEventListener('input', () => {
        updateLiveScore(root);
      });
      slider.addEventListener('change', () => {
        SHREDDED.Haptic.tick();
      });
    });

    // Confirm — commit to state
    root.querySelector('[data-rd-confirm]').addEventListener('click', () => {
      const sleep    = +root.querySelector('[data-rd-input="sleep"]').value;
      const soreness = +root.querySelector('[data-rd-input="soreness"]').value;
      const drive    = +root.querySelector('[data-rd-input="drive"]').value;
      const score = readinessScore(sleep, soreness, drive);
      const v = readinessVerdict(score);
      const today = SHREDDED.DateUtil.todayYMD();
      state.mutate((d) => {
        d.readiness[today] = { sleep, soreness, drive, score, verdict: v.label, ts: Date.now() };
      }, { path: 'readiness' });
      SHREDDED.Haptic.success();
      SHREDDED.Toast.show(`Readiness ${score.toFixed(1)} · ${v.label}`, { tone: v.tone === 'good' ? 'good' : v.tone === 'bad' ? 'bad' : 'accent' });
    });

    // Redo
    root.querySelector('[data-rd-redo]').addEventListener('click', () => {
      const today = SHREDDED.DateUtil.todayYMD();
      state.mutate((d) => { delete d.readiness[today]; }, { path: 'readiness' });
      SHREDDED.Haptic.tick();
    });
  }

  function wirePhaseSeg(state, root) {
    root.querySelectorAll('[data-phase-seg] .seg__opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const phase = +btn.dataset.phase;
        if (phase === state.get('program.currentPhase')) return;
        state.set('program.currentPhase', phase);
        SHREDDED.Haptic.bump();
      });
    });
  }

  /* ---------------------------------------------------------- */
  /* MOUNT                                                       */
  /* ---------------------------------------------------------- */
  /* ---------------------------------------------------------- */
  /* PROGRAM SETUP MODAL                                         */
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

  function openProgramSetupModal(state) {
    const Modal = SHREDDED.Modal;
    if (!Modal) { console.error('[home] Modal helper missing'); return; }

    const program = state.get('program') || {};
    const curStart = program.startDate || SHREDDED.DateUtil.todayYMD();
    const curStartWt = program.stats?.startWeightLbs ?? 147;
    // Defaults for waist: most recent body entry's waist, else 32
    const bodyArr = state.get('body') || [];
    const sortedBody = bodyArr.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const lastWaist = sortedBody[0]?.waist ?? 32;
    // If a body entry already exists for the current start date, pre-fill from it
    const existing = bodyArr.find((e) => e.date === curStart);
    const dW  = (existing?.weight ?? curStartWt).toFixed(1);
    const dWa = (existing?.waist ?? lastWaist).toFixed(1);

    const html = `
      <div class="bio-modal program-setup">
        <p class="card__eyebrow">Program Setup</p>
        <h2 class="bio-modal__title">Start date & baseline</h2>
        <p class="muted" style="font-size:12.5px; margin:0 0 14px; line-height:1.45;">
          Sets the calorie ramp anchor and seeds your weight trend with a baseline body entry.
        </p>

        <label class="program-setup__field">
          <span class="program-setup__field-label">Start date</span>
          <input type="date" class="program-setup__date" data-prog-date value="${curStart}" />
        </label>

        <div class="body-form__rows" style="margin-top: 14px;">
          <div class="body-row">
            <label class="body-row__label">Weight</label>
            <div class="spin" data-spin-field="w" data-spin-step="0.1" data-spin-decimals="1" data-spin-min="50" data-spin-max="500" data-spin-value="${dW}">
              <button class="spin__btn" data-spin-act="dec"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
              <div class="spin__value"><span class="spin__num tnum" data-spin-display>${dW}</span><span class="spin__unit">lbs</span></div>
              <button class="spin__btn" data-spin-act="inc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
          <div class="body-row">
            <label class="body-row__label">Waist</label>
            <div class="spin" data-spin-field="wa" data-spin-step="0.25" data-spin-decimals="1" data-spin-min="20" data-spin-max="60" data-spin-value="${dWa}">
              <button class="spin__btn" data-spin-act="dec"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
              <div class="spin__value"><span class="spin__num tnum" data-spin-display>${dWa}</span><span class="spin__unit">in</span></div>
              <button class="spin__btn" data-spin-act="inc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>

        <p class="muted" style="font-size:11px; margin:14px 0 14px; text-align:center; letter-spacing:-0.005em;">
          A body entry on the start date will be created or replaced.
        </p>

        <button class="btn btn--primary" data-prog-save style="width:100%;">Save Program Setup</button>
      </div>
    `;
    Modal.open(html);
    const root = Modal.root;

    // Wire spinners
    root.querySelectorAll('.spin').forEach((spin) => {
      const step = parseFloat(spin.dataset.spinStep);
      const decimals = +spin.dataset.spinDecimals;
      const min = parseFloat(spin.dataset.spinMin);
      const max = parseFloat(spin.dataset.spinMax);
      const display = spin.querySelector('[data-spin-display]');
      const apply = (delta) => {
        let v = parseFloat(spin.dataset.spinValue);
        v = Math.max(min, Math.min(max, +(v + delta).toFixed(decimals)));
        spin.dataset.spinValue = v;
        display.textContent = v.toFixed(decimals);
        SHREDDED.Haptic.tick();
      };
      attachHold(spin.querySelector('[data-spin-act="dec"]'), () => apply(-step));
      attachHold(spin.querySelector('[data-spin-act="inc"]'), () => apply(+step));
    });

    root.querySelector('[data-prog-save]').addEventListener('click', () => {
      const dateVal = root.querySelector('[data-prog-date]').value;
      const weight = parseFloat(root.querySelector('.spin[data-spin-field="w"]').dataset.spinValue);
      const waist  = parseFloat(root.querySelector('.spin[data-spin-field="wa"]').dataset.spinValue);
      if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        SHREDDED.Toast.show('Pick a valid start date', { tone: 'bad' });
        return;
      }
      if (!(weight > 0)) {
        SHREDDED.Toast.show('Weight must be > 0', { tone: 'bad' });
        return;
      }
      state.mutate((d) => {
        d.program = d.program || {};
        d.program.stats = d.program.stats || {};
        d.program.startDate = dateVal;
        d.program.stats.startWeightLbs = weight;
        // Replace or insert body entry on the start date
        d.body = (d.body || []).filter((e) => e.date !== dateVal);
        d.body.push({ date: dateVal, weight, waist });
      }, { path: '*' });
      SHREDDED.Haptic.success();
      SHREDDED.Toast.show('Program setup saved', { tone: 'good', duration: 1800 });
      Modal.close();
    });
  }

  /* ---------------------------------------------------------- */
  /* MOUNT                                                       */
  /* ---------------------------------------------------------- */
  App.register('home', {
    mount(state) {
      const view = document.querySelector('[data-view="home"] .view__body');
      if (!view) { console.error('[home] view body not found'); return; }
      // Inject template
      view.innerHTML = tplHome();

      // First-pass renders
      renderReadiness(state, view);
      renderRamp(state, view);
      renderPhase(state, view);
      renderStats(state, view);
      renderGlance(state, view);

      // Wire interactions
      wireReadiness(state, view);
      wirePhaseSeg(state, view);
      view.querySelector('[data-program-setup]')?.addEventListener('click', () => openProgramSetupModal(state));

      // Subscribe — re-render only what each path affects
      state.subscribe(({ path }) => {
        if (!path) return;
        const all = path === '*';
        if (all || path.startsWith('readiness'))                  renderReadiness(state, view);
        if (all || path.startsWith('program'))                  { renderRamp(state, view); renderPhase(state, view); renderStats(state, view); }
        if (all || path.startsWith('body'))                     { renderStats(state, view); renderGlance(state, view); }
        if (all || path.startsWith('meals') || path.startsWith('workouts')) renderGlance(state, view);
      });

      // Auto-refresh on day rollover (e.g., user has app open across midnight)
      let lastDay = SHREDDED.DateUtil.todayYMD();
      setInterval(() => {
        const now = SHREDDED.DateUtil.todayYMD();
        if (now !== lastDay) {
          lastDay = now;
          renderReadiness(state, view);
          renderRamp(state, view);
          renderStats(state, view);
          renderGlance(state, view);
        }
      }, 60_000);
    }
  });

})();