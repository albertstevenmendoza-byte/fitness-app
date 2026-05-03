/* ============================================================
   SHREDDED — Body Tab Module (Phase 5)
   ------------------------------------------------------------
   Surfaces: Trend Card with sparkline, Log Form (W / Wa / Ch / Ar),
   History list with delete, Data Management (export / import /
   hard reset).
   ============================================================ */
(function () {
  'use strict';

  const App = window.SHREDDED_APP;
  if (!App) { console.error('[body] App missing'); return; }

  /* ---------------------------------------------------------- */
  /* HELPERS                                                     */
  /* ---------------------------------------------------------- */

  // Sort entries chronologically (ascending). Returns a new array.
  function sortAsc(arr) {
    return arr.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  function sortDesc(arr) {
    return arr.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  // Most recent and earliest entries
  function latestEntry(state) {
    const arr = state.get('body') || [];
    return arr.length ? sortDesc(arr)[0] : null;
  }
  function earliestEntry(state) {
    const arr = state.get('body') || [];
    return arr.length ? sortAsc(arr)[0] : null;
  }

  // Format date as "May 03"
  function fmtDate(ymd) {
    const [y, m, d] = ymd.split('-');
    const dt = new Date(+y, +m - 1, +d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDateLong(ymd) {
    const [y, m, d] = ymd.split('-');
    const dt = new Date(+y, +m - 1, +d);
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Days between two YMD strings (b - a)
  function daysBetweenYMD(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    const A = Date.UTC(ya, ma - 1, da);
    const B = Date.UTC(yb, mb - 1, db);
    return Math.round((B - A) / (1000 * 60 * 60 * 24));
  }

  /* ---------------------------------------------------------- */
  /* SPARKLINE — smooth SVG path through up-to-30 entries        */
  /* ---------------------------------------------------------- */
  function buildSparkline(entries, w = 300, h = 80, pad = 6) {
    if (!entries || entries.length < 2) return null;
    const recent = sortAsc(entries).slice(-30);
    const xs = recent.map((_, i) => i);
    const ys = recent.map((e) => e.weight);
    const xMin = 0, xMax = xs.length - 1;
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    // Pad y range so flat lines aren't pinned to top/bottom
    const yRange = Math.max(0.6, yMax - yMin);
    const yLo = yMin - yRange * 0.18;
    const yHi = yMax + yRange * 0.18;
    const sx = (i) => pad + ((i - xMin) / Math.max(1, xMax - xMin)) * (w - pad * 2);
    const sy = (v) => h - pad - ((v - yLo) / Math.max(0.001, yHi - yLo)) * (h - pad * 2);

    const points = recent.map((_, i) => ({ x: sx(i), y: sy(ys[i]) }));
    // Smooth path: midpoint-quadratic-Bezier
    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i - 1].x + points[i].x) / 2;
      const yc = (points[i - 1].y + points[i].y) / 2;
      d += ` Q ${points[i - 1].x.toFixed(2)} ${points[i - 1].y.toFixed(2)}, ${xc.toFixed(2)} ${yc.toFixed(2)}`;
    }
    d += ` L ${points[points.length - 1].x.toFixed(2)} ${points[points.length - 1].y.toFixed(2)}`;

    // Fill area path (close to bottom)
    const area = `${d} L ${points[points.length - 1].x.toFixed(2)} ${(h - pad).toFixed(2)} L ${points[0].x.toFixed(2)} ${(h - pad).toFixed(2)} Z`;

    return { line: d, area, w, h, last: points[points.length - 1], first: points[0] };
  }

  /* ---------------------------------------------------------- */
  /* TEMPLATES                                                   */
  /* ---------------------------------------------------------- */

  function tplBody(state) {
    return `
      <div class="body-tab">
        ${tplTrend(state)}
        ${tplForm(state)}
        ${tplHistory(state)}
        ${tplData()}
      </div>
    `;
  }

  /* ---------- Trend Card ---------- */
  function tplTrend(state) {
    const entries = state.get('body') || [];
    const latest = latestEntry(state);
    const earliest = earliestEntry(state);
    const startWt = state.get('program.stats.startWeightLbs') ?? 147;
    const startDate = state.get('program.startDate');

    if (entries.length === 0) {
      // Empty state — encourage first log
      return `
        <section class="card trend trend--empty">
          <p class="card__eyebrow">Body Composition</p>
          <h2 class="trend__big tnum">${startWt.toFixed(1)}</h2>
          <p class="trend__big-unit">lbs · starting weight</p>
          <p class="trend__empty">
            Log your first entry below to start tracking.
            <br/><span class="muted">Program started ${startDate ? fmtDateLong(startDate) : 'today'}.</span>
          </p>
        </section>
      `;
    }

    const baseline = earliest?.weight ?? startWt;
    const baselineDate = earliest?.date ?? startDate;
    const current = latest.weight;
    const delta = current - baseline;
    const deltaAbs = Math.abs(delta).toFixed(1);
    const dir = delta < -0.05 ? 'down' : delta > 0.05 ? 'up' : 'flat';
    const days = baselineDate ? Math.max(0, daysBetweenYMD(baselineDate, latest.date)) : 0;

    const spark = buildSparkline(entries);

    return `
      <section class="card trend">
        <header class="trend__head">
          <p class="card__eyebrow">Body Composition</p>
          <span class="trend__count">${entries.length} log${entries.length === 1 ? '' : 's'}</span>
        </header>

        <div class="trend__row">
          <div class="trend__main">
            <div class="trend__current">
              <span class="trend__big tnum">${current.toFixed(1)}</span>
              <span class="trend__big-unit">lbs</span>
            </div>
            <div class="trend__delta trend__delta--${dir}">
              ${dir === 'flat' ? `
                <span class="trend__delta-arrow">~</span>
                <span class="trend__delta-num tnum">stable</span>
              ` : `
                <span class="trend__delta-arrow">${dir === 'down' ? '↓' : '↑'}</span>
                <span class="trend__delta-num tnum">${deltaAbs}</span>
                <span class="trend__delta-unit">lbs</span>
              `}
            </div>
          </div>
        </div>

        ${spark ? `
          <div class="spark">
            <svg class="spark__svg" viewBox="0 0 ${spark.w} ${spark.h}" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="sparkLine" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#00B89E"/>
                  <stop offset="100%" stop-color="#4FFBE0"/>
                </linearGradient>
                <linearGradient id="sparkFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"  stop-color="#00E5C7" stop-opacity="0.18"/>
                  <stop offset="100%" stop-color="#00E5C7" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="${spark.area}" fill="url(#sparkFill)" stroke="none"/>
              <path d="${spark.line}" fill="none" stroke="url(#sparkLine)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="${spark.last.x}" cy="${spark.last.y}" r="3.2" fill="#4FFBE0" stroke="#001210" stroke-width="1.4"/>
            </svg>
          </div>
        ` : `<div class="spark spark--placeholder"><span>Log a 2nd entry to see your trend.</span></div>`}

        <div class="trend__foot">
          <span>Started <strong class="tnum">${baseline.toFixed(1)}</strong> lbs</span>
          ${baselineDate ? `<span class="muted">${fmtDateLong(baselineDate)} · ${days} day${days === 1 ? '' : 's'} ago</span>` : ''}
        </div>
      </section>
    `;
  }

  /* ---------- Log Form ---------- */
  function tplForm(state) {
    const latest = latestEntry(state);
    const startWt = state.get('program.stats.startWeightLbs') ?? 147;

    const dW  = (latest?.weight ?? startWt).toFixed(1);
    const dWa = (latest?.waist ?? 32).toFixed(1);
    const dCh = (latest?.chest ?? 38).toFixed(1);
    const dAr = (latest?.arms  ?? 13.5).toFixed(1);

    return `
      <section class="card body-form">
        <p class="card__eyebrow">Log today</p>
        <h2 class="card__title">${SHREDDED.DateUtil.todayYMD().split('-').slice(1).join('/')} entry</h2>

        <div class="body-form__rows">
          ${rowSpinner('Weight', 'w',  dW,  0.1, 'lbs', 1, 50,  500)}
          ${rowSpinner('Waist',  'wa', dWa, 0.25, 'in',  2, 20,  60)}
          ${rowSpinner('Chest',  'ch', dCh, 0.25, 'in',  2, 20,  70)}
          ${rowSpinner('Arms',   'ar', dAr, 0.25, 'in',  2, 8,   30)}
        </div>

        <button class="btn btn--primary body-form__save" data-body-save>
          <span>Save Entry</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
        </button>
        <p class="body-form__note">Logging the same day will replace today's earlier entry.</p>
      </section>
    `;
  }

  function rowSpinner(label, field, value, step, unit, decimals, min, max) {
    return `
      <div class="body-row" data-body-field="${field}">
        <label class="body-row__label">${label}</label>
        <div class="spin body-row__spin"
             data-spin-field="${field}"
             data-spin-step="${step}"
             data-spin-decimals="${decimals}"
             data-spin-min="${min}"
             data-spin-max="${max}"
             data-spin-value="${value}">
          <button class="spin__btn" data-spin-act="dec" aria-label="Decrease ${label}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>
          </button>
          <div class="spin__value">
            <span class="spin__num tnum" data-spin-display>${(+value).toFixed(decimals)}</span>
            <span class="spin__unit">${unit}</span>
          </div>
          <button class="spin__btn" data-spin-act="inc" aria-label="Increase ${label}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  /* ---------- History ---------- */
  function tplHistory(state) {
    const entries = sortDesc(state.get('body') || []);
    if (entries.length === 0) {
      return `
        <section class="card body-history">
          <p class="card__eyebrow">History</p>
          <div class="body-history__empty">No entries yet.</div>
        </section>
      `;
    }
    return `
      <section class="card body-history">
        <header class="row row--between">
          <p class="card__eyebrow">History</p>
          <span class="body-history__count">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</span>
        </header>
        <div class="body-history__list">
          ${entries.map((e) => `
            <div class="body-entry" data-entry-date="${e.date}">
              <div class="body-entry__date">${fmtDate(e.date)}</div>
              <div class="body-entry__main">
                <span class="body-entry__weight tnum">${e.weight.toFixed(1)}</span>
                <span class="body-entry__weight-unit">lbs</span>
                ${(e.waist || e.chest || e.arms) ? `
                  <div class="body-entry__measures">
                    ${e.waist ? `<span>W <span class="tnum">${e.waist.toFixed(1)}</span></span>` : ''}
                    ${e.chest ? `<span>C <span class="tnum">${e.chest.toFixed(1)}</span></span>` : ''}
                    ${e.arms  ? `<span>A <span class="tnum">${e.arms.toFixed(1)}</span></span>`  : ''}
                  </div>` : ''}
              </div>
              <button class="body-entry__del" data-entry-del="${e.date}" aria-label="Delete entry">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  /* ---------- Data Management ---------- */
  function tplData() {
    return `
      <section class="card body-data">
        <p class="card__eyebrow">Data</p>
        <h2 class="card__title">Backup & restore</h2>
        <p class="body-data__desc">Export captures everything: program, body, workouts, PRs, fridge, meals, grocery, readiness. Import replaces all current data.</p>
        <div class="body-data__row">
          <button class="btn body-data__btn" data-data-export>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
            <span>Export JSON</span>
          </button>
          <button class="btn body-data__btn" data-data-import>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/></svg>
            <span>Import JSON</span>
          </button>
        </div>
        <input type="file" accept=".json,application/json" data-data-file hidden />
        <button class="btn body-data__reset" data-data-reset>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          <span>Hard Reset</span>
        </button>
      </section>
    `;
  }

  /* ---------------------------------------------------------- */
  /* WIRING                                                      */
  /* ---------------------------------------------------------- */

  // Tap-and-hold burst increment (same pattern as Lift/Meals)
  function attachHold(btn, fn) {
    let timeout, interval;
    const start = (e) => { e.preventDefault(); fn();
      timeout = setTimeout(() => { interval = setInterval(fn, 80); }, 400); };
    const end = () => { clearTimeout(timeout); clearInterval(interval); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
  }

  function wireSpinners(view) {
    view.querySelectorAll('.spin').forEach((spin) => {
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
  }

  function wireForm(state, view) {
    view.querySelector('[data-body-save]')?.addEventListener('click', () => {
      const today = SHREDDED.DateUtil.todayYMD();
      const get = (f) => parseFloat(view.querySelector(`.spin[data-spin-field="${f}"]`).dataset.spinValue);
      const entry = { date: today, weight: get('w'), waist: get('wa'), chest: get('ch'), arms: get('ar') };
      if (!(entry.weight > 0)) {
        SHREDDED.Toast.show('Weight is required', { tone: 'bad' });
        return;
      }
      let replaced = false;
      state.mutate((d) => {
        d.body = (d.body || []).filter((e) => {
          if (e.date === today) { replaced = true; return false; }
          return true;
        });
        d.body.push(entry);
      }, { path: 'body' });
      SHREDDED.Haptic.success();
      SHREDDED.Toast.show(replaced ? 'Today\u2019s entry replaced' : 'Entry saved', { tone: 'good' });
    });
  }

  function wireHistory(state, view) {
    view.querySelectorAll('[data-entry-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const date = btn.dataset.entryDel;
        const entry = (state.get('body') || []).find((e) => e.date === date);
        if (!entry) return;
        const Modal = SHREDDED.Modal;
        if (!Modal) {
          // Fallback if Modal isn't loaded — just delete
          deleteEntry(state, date); return;
        }
        const html = `
          <div class="confirm">
            <p class="card__eyebrow">Delete entry</p>
            <h2 class="confirm__title">Remove ${fmtDateLong(date)}?</h2>
            <p class="confirm__desc">Logged <strong class="tnum">${entry.weight.toFixed(1)}</strong> lbs. This cannot be undone.</p>
            <div class="confirm__actions">
              <button class="btn confirm__cancel" data-confirm-cancel>Cancel</button>
              <button class="btn btn--danger" data-confirm-ok>Delete</button>
            </div>
          </div>
        `;
        Modal.open(html);
        const root = Modal.root;
        root.querySelector('[data-confirm-cancel]').addEventListener('click', () => Modal.close());
        root.querySelector('[data-confirm-ok]').addEventListener('click', () => {
          deleteEntry(state, date);
          Modal.close();
        });
      });
    });
  }
  function deleteEntry(state, date) {
    state.mutate((d) => {
      d.body = (d.body || []).filter((e) => e.date !== date);
    }, { path: 'body' });
    SHREDDED.Haptic.bump();
    SHREDDED.Toast.show('Entry deleted', { tone: 'accent' });
  }

  function wireData(state, view) {
    // Export
    view.querySelector('[data-data-export]')?.addEventListener('click', () => {
      try {
        const Storage = SHREDDED.Storage;
        const payload = Storage.export();
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = SHREDDED.DateUtil.todayYMD();
        a.href = url;
        a.download = `shredded-backup-${today}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        SHREDDED.Haptic.success();
        SHREDDED.Toast.show('Backup downloaded', { tone: 'good' });
      } catch (err) {
        SHREDDED.Toast.show('Export failed', { tone: 'bad' });
        console.error(err);
      }
    });

    // Import — trigger hidden file input
    const fileInput = view.querySelector('[data-data-file]');
    view.querySelector('[data-data-import]')?.addEventListener('click', () => {
      fileInput?.click();
    });
    fileInput?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        // Wrapper validation — must be {version, data:{program:...}}
        const wrapped = parsed && typeof parsed === 'object' && parsed.data && parsed.data.program;
        // Bare-state fallback — accept legacy/raw exports too
        const bare    = parsed && typeof parsed === 'object' && parsed.program && !parsed.data;
        if (!wrapped && !bare) {
          throw new Error('Not a valid SHREDDED backup');
        }
        const stateData = wrapped ? parsed.data : parsed;
        const Modal = SHREDDED.Modal;
        if (!Modal) { applyImport(stateData); return; }
        const summary = [
          stateData.body?.length ? `${stateData.body.length} body logs` : null,
          stateData.workouts ? `${Object.keys(stateData.workouts).length} workout days` : null,
          stateData.prs ? `${Object.keys(stateData.prs).length} PRs` : null,
          stateData.meals ? `${Object.keys(stateData.meals).length} meal days` : null
        ].filter(Boolean).join(' · ') || 'no entries';
        const html = `
          <div class="confirm">
            <p class="card__eyebrow">Import data</p>
            <h2 class="confirm__title">Replace current data?</h2>
            <p class="confirm__desc">Backup contains: <strong>${summary}</strong>. Your existing data will be overwritten and the app will reload.</p>
            <div class="confirm__actions">
              <button class="btn confirm__cancel" data-confirm-cancel>Cancel</button>
              <button class="btn btn--primary" data-confirm-ok>Replace & Reload</button>
            </div>
          </div>
        `;
        Modal.open(html);
        const root = Modal.root;
        root.querySelector('[data-confirm-cancel]').addEventListener('click', () => Modal.close());
        root.querySelector('[data-confirm-ok]').addEventListener('click', () => {
          applyImport(stateData);
        });
      } catch (err) {
        SHREDDED.Toast.show(`Import failed: ${err.message}`, { tone: 'bad', duration: 3500 });
        console.error(err);
      } finally {
        // Reset input so re-importing the same file fires change
        e.target.value = '';
      }
    });

    // Hard reset
    view.querySelector('[data-data-reset]')?.addEventListener('click', () => {
      const Modal = SHREDDED.Modal;
      if (!Modal) {
        if (confirm('Reset everything?')) doReset();
        return;
      }
      const html = `
        <div class="confirm">
          <p class="card__eyebrow">Hard reset</p>
          <h2 class="confirm__title">Wipe all data?</h2>
          <p class="confirm__desc">This deletes your program, body logs, workouts, PRs, meals, fridge dates, grocery list, and settings. Cannot be undone. The app will reload.</p>
          <div class="confirm__actions">
            <button class="btn confirm__cancel" data-confirm-cancel>Cancel</button>
            <button class="btn btn--danger" data-confirm-ok>Wipe & Reload</button>
          </div>
        </div>
      `;
      Modal.open(html);
      const root = Modal.root;
      root.querySelector('[data-confirm-cancel]').addEventListener('click', () => Modal.close());
      root.querySelector('[data-confirm-ok]').addEventListener('click', () => {
        Modal.close();
        doReset();
      });
    });
  }

  function applyImport(data) {
    try {
      const Storage = SHREDDED.Storage;
      Storage.save(data);
      SHREDDED.Haptic.success();
      SHREDDED.Toast.show('Data imported · reloading', { tone: 'good', duration: 1400 });
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      SHREDDED.Toast.show('Import failed', { tone: 'bad' });
      console.error(err);
    }
  }

  function doReset() {
    try {
      const Storage = SHREDDED.Storage;
      Storage.clear();
      SHREDDED.Toast.show('Reset · reloading', { tone: 'accent', duration: 1200 });
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      SHREDDED.Toast.show('Reset failed', { tone: 'bad' });
      console.error(err);
    }
  }

  /* ---------------------------------------------------------- */
  /* RENDER                                                      */
  /* ---------------------------------------------------------- */
  function render(state, view) {
    view.innerHTML = tplBody(state);
    wireSpinners(view);
    wireForm(state, view);
    wireHistory(state, view);
    wireData(state, view);
  }

  /* ---------------------------------------------------------- */
  /* MOUNT                                                       */
  /* ---------------------------------------------------------- */
  App.register('body', {
    mount(state) {
      const view = document.querySelector('[data-view="body"] .view__body');
      if (!view) { console.error('[body] view body missing'); return; }
      render(state, view);
      state.subscribe(({ path }) => {
        if (!path) return;
        const all = path === '*';
        if (all || path.startsWith('body') || path.startsWith('program')) {
          render(state, view);
        }
      });
    }
  });

})();