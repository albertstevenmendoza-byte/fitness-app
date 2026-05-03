/* ============================================================
   SHREDDED — Exercise Database & Workout Templates
   ------------------------------------------------------------
   Pure data. No logic.
     EXERCISES — { id → { name, type, muscle, group } }
       type:   'compound' | 'isolation'  (drives rest duration)
       muscle: 'upper' | 'lower'         (drives overload increment)
       group:  display tag
     TEMPLATES — keyed by phase (1, 2, 3). Each phase declares
       an RPE range and an array of "days" (workout sessions).
   ============================================================ */
(function () {
  'use strict';

  const EXERCISES = {
    // ---- Phase 1: Full Body building blocks ----
    'goblet-squat':         { name: 'Goblet Squat',          type: 'compound',  muscle: 'lower', group: 'legs' },
    'db-bench-press':       { name: 'DB Bench Press',        type: 'compound',  muscle: 'upper', group: 'chest' },
    'db-row':               { name: 'DB Row',                type: 'compound',  muscle: 'upper', group: 'back' },
    'db-shoulder-press':    { name: 'DB Shoulder Press',     type: 'compound',  muscle: 'upper', group: 'shoulders' },
    'db-curl':              { name: 'DB Curl',               type: 'isolation', muscle: 'upper', group: 'arms' },
    'rdl':                  { name: 'Romanian Deadlift',     type: 'compound',  muscle: 'lower', group: 'posterior' },
    'incline-db-press':     { name: 'Incline DB Press',      type: 'compound',  muscle: 'upper', group: 'chest' },
    'lat-pulldown':         { name: 'Lat Pulldown',          type: 'compound',  muscle: 'upper', group: 'back' },
    'lateral-raise':        { name: 'Lateral Raise',         type: 'isolation', muscle: 'upper', group: 'shoulders' },
    'tricep-pushdown':      { name: 'Tricep Pushdown',       type: 'isolation', muscle: 'upper', group: 'arms' },
    'bulgarian-split-squat':{ name: 'Bulgarian Split Squat', type: 'compound',  muscle: 'lower', group: 'legs' },
    'pushup':               { name: 'Push-up',               type: 'compound',  muscle: 'upper', group: 'chest' },
    'cable-row':            { name: 'Cable Row',             type: 'compound',  muscle: 'upper', group: 'back' },
    'face-pull':            { name: 'Face Pull',             type: 'isolation', muscle: 'upper', group: 'shoulders' },
    'hammer-curl':          { name: 'Hammer Curl',           type: 'isolation', muscle: 'upper', group: 'arms' },

    // ---- Phase 2 / 3: Upper-Lower additions ----
    'bench-press':          { name: 'Bench Press',           type: 'compound',  muscle: 'upper', group: 'chest' },
    'barbell-row':          { name: 'Barbell Row',           type: 'compound',  muscle: 'upper', group: 'back' },
    'overhead-press':       { name: 'Overhead Press',        type: 'compound',  muscle: 'upper', group: 'shoulders' },
    'barbell-curl':         { name: 'Barbell Curl',          type: 'isolation', muscle: 'upper', group: 'arms' },
    'back-squat':           { name: 'Back Squat',            type: 'compound',  muscle: 'lower', group: 'legs' },
    'leg-curl':             { name: 'Leg Curl',              type: 'isolation', muscle: 'lower', group: 'posterior' },
    'standing-calf-raise':  { name: 'Standing Calf Raise',   type: 'isolation', muscle: 'lower', group: 'calves' },
    'hanging-leg-raise':    { name: 'Hanging Leg Raise',     type: 'isolation', muscle: 'upper', group: 'core' },
    'pull-up':              { name: 'Pull-up',               type: 'compound',  muscle: 'upper', group: 'back' },
    'seated-cable-row':     { name: 'Seated Cable Row',      type: 'compound',  muscle: 'upper', group: 'back' },
    'deadlift':             { name: 'Deadlift',              type: 'compound',  muscle: 'lower', group: 'posterior' },
    'front-squat':          { name: 'Front Squat',           type: 'compound',  muscle: 'lower', group: 'legs' },
    'leg-extension':        { name: 'Leg Extension',         type: 'isolation', muscle: 'lower', group: 'legs' },
    'seated-calf-raise':    { name: 'Seated Calf Raise',     type: 'isolation', muscle: 'lower', group: 'calves' },
    'cable-crunch':         { name: 'Cable Crunch',          type: 'isolation', muscle: 'upper', group: 'core' }
  };

  /* ----------------------------------------------------------
     TEMPLATES — phase → days[] of workouts.
     Each "day" has: id, name, focus, exercises[] (id, sets, reps[low, high]).
     ---------------------------------------------------------- */
  const TEMPLATES = {
    1: {
      label: 'Phase 1 · 3-day Full Body',
      rpe: [6, 7],
      days: [
        { id: 'p1-fb-a', name: 'Full Body A', focus: 'Squat · Press · Row',
          exercises: [
            { id: 'goblet-squat',       sets: 3, reps: [8, 12] },
            { id: 'db-bench-press',     sets: 3, reps: [8, 12] },
            { id: 'db-row',             sets: 3, reps: [8, 12] },
            { id: 'db-shoulder-press',  sets: 3, reps: [10, 15] },
            { id: 'db-curl',            sets: 3, reps: [10, 15] }
          ]
        },
        { id: 'p1-fb-b', name: 'Full Body B', focus: 'Hinge · Incline · Pull',
          exercises: [
            { id: 'rdl',                sets: 3, reps: [8, 12] },
            { id: 'incline-db-press',   sets: 3, reps: [8, 12] },
            { id: 'lat-pulldown',       sets: 3, reps: [8, 12] },
            { id: 'lateral-raise',      sets: 3, reps: [12, 15] },
            { id: 'tricep-pushdown',    sets: 3, reps: [10, 15] }
          ]
        },
        { id: 'p1-fb-c', name: 'Full Body C', focus: 'Unilateral · Push · Row',
          exercises: [
            { id: 'bulgarian-split-squat', sets: 3, reps: [8, 12] },
            { id: 'pushup',                sets: 3, reps: [8, 15] },
            { id: 'cable-row',             sets: 3, reps: [8, 12] },
            { id: 'face-pull',             sets: 3, reps: [12, 15] },
            { id: 'hammer-curl',           sets: 3, reps: [10, 15] }
          ]
        }
      ]
    },

    2: {
      label: 'Phase 2 · 4-day Upper / Lower',
      rpe: [7, 8],
      days: [
        { id: 'p2-up-a', name: 'Upper A', focus: 'Horizontal Push & Pull',
          exercises: [
            { id: 'bench-press',        sets: 4, reps: [6, 10] },
            { id: 'barbell-row',        sets: 4, reps: [6, 10] },
            { id: 'overhead-press',     sets: 3, reps: [6, 10] },
            { id: 'lat-pulldown',       sets: 3, reps: [8, 12] },
            { id: 'barbell-curl',       sets: 3, reps: [8, 12] },
            { id: 'tricep-pushdown',    sets: 3, reps: [8, 12] }
          ]
        },
        { id: 'p2-low-a', name: 'Lower A', focus: 'Squat · Hinge',
          exercises: [
            { id: 'back-squat',         sets: 4, reps: [5, 8] },
            { id: 'rdl',                sets: 3, reps: [6, 10] },
            { id: 'leg-curl',           sets: 3, reps: [8, 12] },
            { id: 'standing-calf-raise',sets: 3, reps: [10, 15] },
            { id: 'hanging-leg-raise',  sets: 3, reps: [10, 15] }
          ]
        },
        { id: 'p2-up-b', name: 'Upper B', focus: 'Vertical & Volume',
          exercises: [
            { id: 'incline-db-press',   sets: 4, reps: [8, 12] },
            { id: 'pull-up',            sets: 4, reps: [6, 10] },
            { id: 'db-shoulder-press',  sets: 3, reps: [8, 12] },
            { id: 'seated-cable-row',   sets: 3, reps: [8, 12] },
            { id: 'lateral-raise',      sets: 3, reps: [12, 15] },
            { id: 'hammer-curl',        sets: 3, reps: [8, 12] }
          ]
        },
        { id: 'p2-low-b', name: 'Lower B', focus: 'Deadlift Focus',
          exercises: [
            { id: 'deadlift',           sets: 3, reps: [4, 6] },
            { id: 'front-squat',        sets: 3, reps: [8, 12] },
            { id: 'leg-extension',      sets: 3, reps: [10, 15] },
            { id: 'seated-calf-raise',  sets: 3, reps: [12, 15] },
            { id: 'cable-crunch',       sets: 3, reps: [12, 15] }
          ]
        }
      ]
    },

    3: {
      label: 'Phase 3 · 4-day Upper / Lower',
      rpe: [8, 9],
      days: [
        { id: 'p3-up-a', name: 'Upper A', focus: 'Heavy Push & Pull',
          exercises: [
            { id: 'bench-press',        sets: 4, reps: [4, 6] },
            { id: 'barbell-row',        sets: 4, reps: [4, 6] },
            { id: 'overhead-press',     sets: 3, reps: [5, 8] },
            { id: 'lat-pulldown',       sets: 3, reps: [6, 10] },
            { id: 'barbell-curl',       sets: 3, reps: [6, 10] },
            { id: 'tricep-pushdown',    sets: 3, reps: [6, 10] }
          ]
        },
        { id: 'p3-low-a', name: 'Lower A', focus: 'Strength · Squat',
          exercises: [
            { id: 'back-squat',         sets: 4, reps: [3, 6] },
            { id: 'rdl',                sets: 3, reps: [4, 8] },
            { id: 'leg-curl',           sets: 3, reps: [6, 10] },
            { id: 'standing-calf-raise',sets: 4, reps: [8, 12] },
            { id: 'hanging-leg-raise',  sets: 3, reps: [8, 12] }
          ]
        },
        { id: 'p3-up-b', name: 'Upper B', focus: 'Strength · Vertical',
          exercises: [
            { id: 'incline-db-press',   sets: 4, reps: [6, 10] },
            { id: 'pull-up',            sets: 4, reps: [4, 8] },
            { id: 'db-shoulder-press',  sets: 3, reps: [6, 10] },
            { id: 'seated-cable-row',   sets: 3, reps: [6, 10] },
            { id: 'lateral-raise',      sets: 3, reps: [10, 15] },
            { id: 'hammer-curl',        sets: 3, reps: [6, 10] }
          ]
        },
        { id: 'p3-low-b', name: 'Lower B', focus: 'Pull · Power',
          exercises: [
            { id: 'deadlift',           sets: 3, reps: [3, 5] },
            { id: 'front-squat',        sets: 3, reps: [6, 10] },
            { id: 'leg-extension',      sets: 3, reps: [8, 12] },
            { id: 'seated-calf-raise',  sets: 3, reps: [10, 15] },
            { id: 'cable-crunch',       sets: 3, reps: [10, 15] }
          ]
        }
      ]
    }
  };

  // Lookups
  const findDay = (phase, dayId) =>
    (TEMPLATES[phase]?.days || []).find((d) => d.id === dayId) || null;

  // Public surface
  window.SHREDDED_EXERCISES = EXERCISES;
  window.SHREDDED_TEMPLATES = TEMPLATES;
  window.SHREDDED_FIND_DAY  = findDay;
})();