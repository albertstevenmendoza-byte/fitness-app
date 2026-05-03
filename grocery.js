/* ============================================================
   SHREDDED — Grocery Tab Module (Phase 6)
   ------------------------------------------------------------
   Surfaces: Hero progress card, six categorized checklists
   (Proteins / Dairy / Carbs / Veg / Fats / Supps), reset list.
   Two-state per item: absent (default) ↔ true (have it).
   Writes propagate to state.grocery; meals.js reads to flag
   meal-level Ready / Missing chips.
   ============================================================ */
(function () {
  'use strict';

  const App     = window.SHREDDED_APP;
  const GROCERY = window.SHREDDED_GROCERY;
  if (!App || !GROCERY) { console.error('[grocery] deps missing'); return; }

  /* ---------------------------------------------------------- */
  /* HELPERS                                                     */
  /* ---------------------------------------------------------- */
  function totals(state) {
    const g = state.get('grocery') || {};
    let total = 0, checked = 0;
    for (const cat of Object.values(GROCERY)) {
      for (const item of cat.items) {
        total++;
        if (g[item.slug] === true) checked++;
      }
    }
    return { total, checked };
  }
  function categoryTotals(state, cat) {
    const g = state.get('grocery') || {};
    let checked = 0;
    for (const item of cat.items) if (g[item.slug] === true) checked++;
    return { total: cat.items.length, checked };
  }

  // Active program week (fed by ramp util, used to dim "WK 5+" items below current)
  function programWeek(state) {
    const program = state.get('program');
    if (!program?.startDate) return 1;
    return SHREDDED.DateUtil.programWeek(program.startDate, program.calorieRamp.totalWeeks);
  }

  /* ---------------------------------------------------------- */
  /* TEMPLATES                                                   */
  /* ---------------------------------------------------------- */
  function tplGrocery(state) {
    const week = programWeek(state);
    return `
      <div class="grocery">
        ${tplHero(state)}
        ${Object.entries(GROCERY).map(([key, cat]) => tplCategory(state, key, cat, week)).join('')}
      </div>
    `;
  }

  function tplHero(state) {
    const t = totals(state);
    const pct = t.total > 0 ? (t.checked / t.total) * 100 : 0;
    const status =
      t.checked === 0      ? { label: 'Start checking what you have',  tone: 'idle' } :
      t.checked === t.total ? { label: 'All set · ready to cook',       tone: 'good' } :
                              { label: `${t.total - t.checked} item${t.total - t.checked === 1 ? '' : 's'} still needed`, tone: 'warn' };

    return `
      <section class="card grocery-hero">
        <header class="grocery-hero__head">
          <p class="card__eyebrow">Weekly Grocery</p>
          <span class="grocery-hero__count tnum">${t.checked}<span class="grocery-hero__den">/${t.total}</span></span>
        </header>
        <div class="grocery-hero__bar">
          <span class="grocery-hero__bar-fill" style="width:${pct.toFixed(1)}%"></span>
        </div>
        <p class="grocery-hero__status grocery-hero__status--${status.tone}">${status.label}</p>
        <p class="grocery-hero__hint">Check items as you confirm them in your kitchen. The Meals tab will flag anything still needed for each recipe.</p>
        <button class="btn grocery-hero__reset" data-grocery-reset ${t.checked === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          <span>Reset list</span>
        </button>
      </section>
    `;
  }

  function tplCategory(state, key, cat, currentWeek) {
    const ct = categoryTotals(state, cat);
    const allDone = ct.total > 0 && ct.checked === ct.total;
    return `
      <section class="card cat" data-cat="${key}">
        <header class="cat__head">
          <button class="cat__head-tap" data-cat-toggle="${key}" aria-label="Toggle all in ${cat.label}">
            <div class="cat__title-block">
              <p class="card__eyebrow cat__eyebrow">${cat.label}</p>
              ${cat.hint ? `<p class="cat__hint">${cat.hint}</p>` : ''}
            </div>
            <span class="cat__count cat__count--${allDone ? 'good' : ct.checked > 0 ? 'partial' : 'idle'}">
              <span class="tnum">${ct.checked}</span><span class="cat__count-den">/${ct.total}</span>
            </span>
          </button>
        </header>
        <div class="cat__items">
          ${cat.items.map((item) => tplItem(state, item, currentWeek)).join('')}
        </div>
      </section>
    `;
  }

  function tplItem(state, item, currentWeek) {
    const grocery = state.get('grocery') || {};
    const checked = grocery[item.slug] === true;
    const future = item.weekStart && currentWeek < item.weekStart;
    return `
      <button class="gitem ${checked ? 'is-checked' : ''} ${future ? 'is-future' : ''}" data-grocery-toggle="${item.slug}">
        <span class="gitem__check" aria-hidden="true">
          ${checked ? `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          ` : ''}
        </span>
        <div class="gitem__main">
          <div class="gitem__row1">
            <span class="gitem__name">${item.name}</span>
            ${item.freshGrab ? `<span class="gitem__pill gitem__pill--fresh">Fresh</span>` : ''}
            ${future ? `<span class="gitem__pill gitem__pill--future">WK ${item.weekStart}+</span>` : ''}
          </div>
          <div class="gitem__row2">
            <span class="gitem__qty">${item.qty}</span>
            ${item.note ? `<span class="gitem__sep">·</span><span class="gitem__note">${item.note}</span>` : ''}
          </div>
        </div>
      </button>
    `;
  }

  /* ---------------------------------------------------------- */
  /* WIRING                                                      */
  /* ---------------------------------------------------------- */
  function wire(state, view) {
    // Item taps — toggle truthy ↔ absent
    view.querySelectorAll('[data-grocery-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.groceryToggle;
        state.mutate((d) => {
          d.grocery = d.grocery || {};
          if (d.grocery[slug] === true) {
            delete d.grocery[slug];                 // uncheck → return to absent
          } else {
            d.grocery[slug] = true;                 // check → mark have-it
          }
        }, { path: 'grocery' });
        SHREDDED.Haptic.tick();
      });
    });

    // Category headers — toggle all in category
    view.querySelectorAll('[data-cat-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.catToggle;
        const cat = GROCERY[key];
        if (!cat) return;
        const ct = categoryTotals(state, cat);
        const setAll = ct.checked < ct.total; // not all checked → check all; else clear all
        state.mutate((d) => {
          d.grocery = d.grocery || {};
          for (const item of cat.items) {
            if (setAll) d.grocery[item.slug] = true;
            else delete d.grocery[item.slug];
          }
        }, { path: 'grocery' });
        SHREDDED.Haptic.bump();
        SHREDDED.Toast.show(setAll ? `${cat.label} checked` : `${cat.label} cleared`, { tone: setAll ? 'good' : 'accent' });
      });
    });

    // Reset list — confirmed wipe of grocery state
    view.querySelector('[data-grocery-reset]')?.addEventListener('click', () => {
      const t = totals(state);
      if (t.checked === 0) return;
      const Modal = SHREDDED.Modal;
      const doReset = () => {
        state.mutate((d) => { d.grocery = {}; }, { path: 'grocery' });
        SHREDDED.Haptic.bump();
        SHREDDED.Toast.show('Grocery list reset', { tone: 'accent' });
      };
      if (!Modal) { if (confirm('Reset grocery list?')) doReset(); return; }
      const html = `
        <div class="confirm">
          <p class="card__eyebrow">Reset grocery</p>
          <h2 class="confirm__title">Uncheck everything?</h2>
          <p class="confirm__desc">All <strong>${t.checked}</strong> checked item${t.checked === 1 ? '' : 's'} will be cleared. The Meals tab will return to idle until you check items again.</p>
          <div class="confirm__actions">
            <button class="btn confirm__cancel" data-confirm-cancel>Cancel</button>
            <button class="btn btn--danger" data-confirm-ok>Reset</button>
          </div>
        </div>
      `;
      Modal.open(html);
      const root = Modal.root;
      root.querySelector('[data-confirm-cancel]').addEventListener('click', () => Modal.close());
      root.querySelector('[data-confirm-ok]').addEventListener('click', () => {
        doReset();
        Modal.close();
      });
    });
  }

  /* ---------------------------------------------------------- */
  /* RENDER                                                      */
  /* ---------------------------------------------------------- */
  function render(state, view) {
    view.innerHTML = tplGrocery(state);
    wire(state, view);
  }

  /* ---------------------------------------------------------- */
  /* MOUNT                                                       */
  /* ---------------------------------------------------------- */
  App.register('grocery', {
    mount(state) {
      const view = document.querySelector('[data-view="grocery"] .view__body');
      if (!view) { console.error('[grocery] view body missing'); return; }
      render(state, view);
      state.subscribe(({ path }) => {
        if (!path) return;
        const all = path === '*';
        if (all || path.startsWith('grocery') || path.startsWith('program')) {
          render(state, view);
        }
      });
    }
  });
})();