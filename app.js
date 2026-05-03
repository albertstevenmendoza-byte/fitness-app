/* ============================================================
   SHREDDED — Core App Module (Phase 1 Foundation)
   ------------------------------------------------------------
   Modules:
     • Storage    — thin localStorage wrapper, namespaced + safe
     • Schema     — default state shape (anticipates all 6 tabs)
     • State      — reactive store, pub/sub, autosave
     • Router     — tab switcher with view transitions
     • Toast      — iOS-style transient notifications
     • Haptic     — navigator.vibrate fallback
     • Date       — small helpers (ymd, weekFrom, etc.)
     • App        — boot sequence + module registry
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- */
  /* Storage                                                    */
  /* ---------------------------------------------------------- */
  const Storage = (() => {
    const NAMESPACE = 'shredded:v1';
    const SINGLE_KEY = `${NAMESPACE}:state`;

    const safeJSON = {
      parse(str, fallback) {
        try { return JSON.parse(str); } catch { return fallback; }
      },
      stringify(val) {
        try { return JSON.stringify(val); } catch { return null; }
      }
    };

    return {
      load(fallback = null) {
        const raw = localStorage.getItem(SINGLE_KEY);
        if (raw == null) return fallback;
        return safeJSON.parse(raw, fallback);
      },
      save(state) {
        const str = safeJSON.stringify(state);
        if (str != null) localStorage.setItem(SINGLE_KEY, str);
      },
      export() {
        const data = this.load({});
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          data
        };
      },
      import(payload) {
        if (!payload || typeof payload !== 'object' || !payload.data) return false;
        this.save(payload.data);
        return true;
      },
      clear() {
        localStorage.removeItem(SINGLE_KEY);
      },
      // Bytes used (rough estimate — useful for Stats tab)
      sizeBytes() {
        const raw = localStorage.getItem(SINGLE_KEY) || '';
        return new Blob([raw]).size;
      }
    };
  })();

  /* ---------------------------------------------------------- */
  /* Schema — single source of truth for default state          */
  /* ---------------------------------------------------------- */
  const Schema = {
    defaults() {
      return {
        meta: {
          createdAt: new Date().toISOString(),
          version: 1
        },
        program: {
          startDate: Schema.todayYMD(),  // Day 1 of Week 1
          currentPhase: 1,               // 1 | 2 | 3 (manual override allowed)
          calorieRamp: {
            base: 1500,
            stepPerWeek: 100,
            ceiling: 2050,
            totalWeeks: 8
          },
          stats: {
            startWeightLbs: 147,
            heightIn: null,
            ageYears: null,
            sex: 'male',
            activity: 'moderate'        // sedentary | light | moderate | active
          }
        },
        readiness: {
          // Keyed by YYYY-MM-DD: { sleep, soreness, drive, score, verdict }
        },
        meals: {
          // Keyed by YYYY-MM-DD: { selections: { '5am': 0, '9am': 0, ... }, checked: { '5am': true, ... }, usda: [{ id, name, grams, kcal, p, c, f }] }
        },
        fridge: {
          // Keyed by protein id: { cookedOn: 'YYYY-MM-DD' }
          chicken: null,
          turkey: null,
          rice: null,
          sweetPotato: null
        },
        workouts: {
          // Keyed by YYYY-MM-DD: { dayId, exercises: { [exId]: [{ weight, reps, rpe, ts }] } }
        },
        prs: {
          // Keyed by exId: { weight, reps, e1rm, achievedOn }
        },
        body: [
          // [{ date, weight, waist, chest, arms }]
        ],
        grocery: {
          // Keyed by item id: boolean (checked)
        },
        ui: {
          activeTab: 'home',
          firstRunComplete: false
        }
      };
    },

    /** YYYY-MM-DD in local time */
    todayYMD(d = new Date()) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    /** Deep-merge persisted data with defaults so new schema keys backfill cleanly */
    hydrate(persisted) {
      const merge = (a, b) => {
        if (Array.isArray(a)) return Array.isArray(b) ? b : a;
        if (a && typeof a === 'object') {
          const out = { ...a };
          if (b && typeof b === 'object') {
            for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
          }
          return out;
        }
        return (b !== undefined) ? b : a;
      };
      return merge(Schema.defaults(), persisted || {});
    }
  };

  /* ---------------------------------------------------------- */
  /* State — reactive pub/sub store                             */
  /* ---------------------------------------------------------- */
  class State {
    constructor() {
      this._data = Schema.hydrate(Storage.load(null));
      this._subs = new Set();
      this._saveTimer = null;
    }

    /** Read full state (treat as readonly) */
    get all() { return this._data; }

    /** Path-based getter: get('program.currentPhase') */
    get(path) {
      return path.split('.').reduce((o, k) => (o == null ? o : o[k]), this._data);
    }

    /** Path-based setter, autosaves + notifies. set('program.currentPhase', 2) */
    set(path, value) {
      const keys = path.split('.');
      const last = keys.pop();
      let cursor = this._data;
      for (const k of keys) {
        if (cursor[k] == null || typeof cursor[k] !== 'object') cursor[k] = {};
        cursor = cursor[k];
      }
      cursor[last] = value;
      this._scheduleSave();
      this._notify({ path, value });
      return value;
    }

    /** Mutator helper — run a function that mutates state, then save+notify */
    mutate(fn, meta = {}) {
      fn(this._data);
      this._scheduleSave();
      // Default to '*' so subscribers re-render unless the caller passes a more
      // specific path. Coarse but safe — explicit paths are still preferred for perf.
      this._notify({ path: '*', ...meta });
    }

    /** Replace entire state (e.g. on JSON import) */
    replace(newData) {
      this._data = Schema.hydrate(newData);
      this._scheduleSave(true);
      this._notify({ path: '*', value: this._data });
    }

    /** Hard reset back to defaults */
    reset() {
      Storage.clear();
      this._data = Schema.defaults();
      this._notify({ path: '*', value: this._data });
    }

    subscribe(fn) {
      this._subs.add(fn);
      return () => this._subs.delete(fn);
    }

    _notify(payload) {
      this._subs.forEach((fn) => {
        try { fn(payload, this._data); }
        catch (e) { console.error('[State] subscriber error', e); }
      });
    }

    _scheduleSave(immediate = false) {
      if (immediate) {
        Storage.save(this._data);
        return;
      }
      // Debounce — coalesce rapid set() calls into one write
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => Storage.save(this._data), 120);
    }
  }

  /* ---------------------------------------------------------- */
  /* Router — switches the visible <section data-view>          */
  /* ---------------------------------------------------------- */
  class Router {
    constructor(state) {
      this.state = state;
      this.views = new Map();
      this.tabs  = new Map();
      document.querySelectorAll('[data-view]').forEach((el) => {
        this.views.set(el.dataset.view, el);
      });
      document.querySelectorAll('.tab[data-tab]').forEach((el) => {
        this.tabs.set(el.dataset.tab, el);
        el.addEventListener('click', () => this.go(el.dataset.tab));
      });
    }

    go(name) {
      if (!this.views.has(name)) return;
      // Hide all, show target
      this.views.forEach((view, key) => {
        const isActive = key === name;
        view.hidden = !isActive;
      });
      this.tabs.forEach((tab, key) => {
        tab.setAttribute('aria-selected', key === name ? 'true' : 'false');
      });
      this.state.set('ui.activeTab', name);
      Haptic.tick();
      // Reset scroll on tab change so transitions land at the top
      const app = document.getElementById('app');
      if (app) app.scrollTo({ top: 0, behavior: 'instant' });
    }

    current() {
      return this.state.get('ui.activeTab') || 'home';
    }

    init() {
      this.go(this.current());
    }
  }

  /* ---------------------------------------------------------- */
  /* Toast — transient floating pill                             */
  /* ---------------------------------------------------------- */
  const Toast = (() => {
    const root = () => document.getElementById('toast-root');
    const show = (msg, { tone = 'default', duration = 2200 } = {}) => {
      const r = root();
      if (!r) return;
      const el = document.createElement('div');
      el.className = 'toast' + (tone !== 'default' ? ` toast--${tone}` : '');
      el.textContent = msg;
      r.appendChild(el);
      setTimeout(() => {
        el.classList.add('is-leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, duration);
    };
    return { show };
  })();

  /* ---------------------------------------------------------- */
  /* Haptic — best-effort device feedback                       */
  /* ---------------------------------------------------------- */
  const Haptic = {
    tick()   { if (navigator.vibrate) navigator.vibrate(8); },
    bump()   { if (navigator.vibrate) navigator.vibrate(18); },
    success(){ if (navigator.vibrate) navigator.vibrate([12, 40, 12]); },
    alert()  { if (navigator.vibrate) navigator.vibrate([30, 60, 30]); }
  };

  /* ---------------------------------------------------------- */
  /* Date helpers                                                */
  /* ---------------------------------------------------------- */
  const DateUtil = {
    todayYMD: Schema.todayYMD,
    daysBetween(aYMD, bYMD) {
      const a = new Date(aYMD + 'T00:00:00');
      const b = new Date(bYMD + 'T00:00:00');
      return Math.round((b - a) / 86_400_000);
    },
    /** Returns 1..N (clamped) given a program start date and total weeks */
    programWeek(startYMD, totalWeeks = 8, today = Schema.todayYMD()) {
      const days = Math.max(0, DateUtil.daysBetween(startYMD, today));
      return Math.min(totalWeeks, Math.floor(days / 7) + 1);
    },
    /** Days remaining until next Monday-style ramp tick */
    daysUntilNextWeek(startYMD, today = Schema.todayYMD()) {
      const days = Math.max(0, DateUtil.daysBetween(startYMD, today));
      return 7 - (days % 7);
    }
  };

  /* ---------------------------------------------------------- */
  /* App — boot                                                 */
  /* ---------------------------------------------------------- */
  const App = {
    state: null,
    router: null,
    modules: {},          // Phase 2+ modules register here

    /** Modules call App.register('home', { mount(state){...} }) */
    register(name, mod) {
      this.modules[name] = mod;
      if (this.state && typeof mod.mount === 'function') mod.mount(this.state);
    },

    boot() {
      this.state  = new State();
      this.router = new Router(this.state);

      // Boot every registered module with a reference to state
      Object.values(this.modules).forEach((mod) => {
        if (typeof mod.mount === 'function') mod.mount(this.state);
      });

      this.router.init();

      // First-run welcome
      if (!this.state.get('ui.firstRunComplete')) {
        Toast.show('Welcome to SHREDDED', { tone: 'accent', duration: 2400 });
        this.state.set('ui.firstRunComplete', true);
      }

      // Lock viewport from accidental zoom on iOS Safari double-tap
      document.addEventListener('gesturestart', (e) => e.preventDefault());

      // Keep scrollable area sized correctly when iOS toolbar shows/hides
      const setVH = () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
      };
      setVH();
      window.addEventListener('resize', setVH, { passive: true });
      window.addEventListener('orientationchange', setVH, { passive: true });

      // Expose for debugging in DevTools — namespaced
      window.SHREDDED = { state: this.state, router: this.router, Storage, Toast, Haptic, DateUtil, Schema };
    }
  };

  /* ---------------------------------------------------------- */
  /* Bootstrap on DOM ready                                     */
  /* ---------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
  } else {
    App.boot();
  }

  // Public surface for Phase 2+ files to register their modules
  window.SHREDDED_APP = App;

})();