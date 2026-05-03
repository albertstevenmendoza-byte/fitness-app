/* ============================================================
   SHREDDED — Meal Database (Phase 4 data)
   ------------------------------------------------------------
   Each slot has 3 options. Each option lists ingredients with
   per-serving macros (grams, kcal, p, c, f) and a `weekly` array
   indexed by week (Wk 1 → idx 0). weekly[i] is null (no addition
   that week) or { label, kcal, p, c, f } describing the cumulative
   week-N addition relative to base.

   Conventions:
     fridgeProtein: id key in state.fridge that gates freshness
     freshGrab:     ingredient is grabbed fresh daily (e.g. banana)
                    → ignored by fridge tracker even if cooked
   ============================================================ */
(function () {
  'use strict';

  // Reusable cumulative addition shorthand
  const A = {
    rice50:    { label: '+50 g rice',                               kcal: 65,  p: 1, c: 14, f: 0 },
    halfBanana:{ label: '+½ banana',                                kcal: 50,  p: 1, c: 13, f: 0 },
    fullBanana:{ label: '+1 banana',                                kcal: 105, p: 1, c: 27, f: 0 },
    almondsOz: { label: '+1 oz almonds',                            kcal: 165, p: 6, c: 6,  f: 14 },
    riceOil:   { label: '+50 g rice, +1 tbsp olive oil',            kcal: 185, p: 1, c: 14, f: 14 },
    bananaPB:  { label: '+1 banana, +1 tbsp fit butter',            kcal: 200, p: 5, c: 30, f: 8 }
  };

  const MEALS = {
    '5am': {
      slot: '5am',
      time: '5:00 AM',
      label: 'Breakfast',
      tag: 'PRE-WO',
      fridgeProtein: null,           // pantry/fresh — not fridge-tracked
      options: [
        {
          id: 'b-protein-oats',
          name: 'Protein Oats Stack',
          ingredients: [
            { name: 'Rolled oats',        grams: 50,  kcal: 190, p: 7,  c: 33, f: 4 },
            { name: 'Whey protein',       grams: 25,  kcal: 100, p: 22, c: 1,  f: 1 },
            { name: 'Banana',             grams: 120, kcal: 105, p: 1,  c: 27, f: 0, freshGrab: true }
          ]
        },
        {
          id: 'b-egg-white-oats',
          name: 'Egg White + Oats',
          ingredients: [
            { name: 'Egg whites',         grams: 140, kcal: 75,  p: 16, c: 1,  f: 0 },
            { name: 'Rolled oats',        grams: 50,  kcal: 190, p: 7,  c: 33, f: 4 },
            { name: 'Banana',             grams: 120, kcal: 105, p: 1,  c: 27, f: 0, freshGrab: true }
          ]
        },
        {
          id: 'b-whey-shake-oats',
          name: 'Whey Banana Oats Shake',
          ingredients: [
            { name: 'Whey protein',       grams: 30,  kcal: 120, p: 25, c: 2,  f: 1 },
            { name: 'Banana',             grams: 120, kcal: 105, p: 1,  c: 27, f: 0, freshGrab: true },
            { name: 'Rolled oats',        grams: 50,  kcal: 190, p: 7,  c: 33, f: 4 }
          ]
        }
      ],
      weekly: [null, null, A.halfBanana, A.halfBanana, A.fullBanana, A.fullBanana, A.bananaPB, A.bananaPB]
    },

    '9am': {
      slot: '9am',
      time: '9:00 AM',
      label: 'Snack',
      tag: 'POST-WO',
      fridgeProtein: null,           // dairy/pantry — buy weekly, no batch cook
      options: [
        {
          id: 's-whey-banana',
          name: 'Whey + Banana',
          ingredients: [
            { name: 'Whey protein',       grams: 30,  kcal: 120, p: 25, c: 2,  f: 1 },
            { name: 'Banana',             grams: 120, kcal: 105, p: 1,  c: 27, f: 0, freshGrab: true }
          ]
        },
        {
          id: 's-greek-berries',
          name: 'Greek Yogurt + Berries',
          ingredients: [
            { name: 'Greek yogurt 0%',    grams: 200, kcal: 120, p: 20, c: 7,  f: 1 },
            { name: 'Mixed berries',      grams: 100, kcal: 50,  p: 1,  c: 12, f: 0 }
          ]
        },
        {
          id: 's-cottage-pineapple',
          name: 'Cottage + Pineapple',
          ingredients: [
            { name: 'Cottage cheese 2%',  grams: 150, kcal: 130, p: 16, c: 5,  f: 4 },
            { name: 'Pineapple',          grams: 100, kcal: 50,  p: 1,  c: 13, f: 0 }
          ]
        }
      ],
      weekly: [null, null, null, A.almondsOz, A.almondsOz, A.almondsOz, A.almondsOz, A.almondsOz]
    },

    '1pm': {
      slot: '1pm',
      time: '1:00 PM',
      label: 'Lunch',
      tag: null,
      fridgeProtein: 'chicken',      // most options use chicken; turkey alt also tracked
      options: [
        {
          id: 'l-chicken-rice',
          name: 'Chicken + Rice + Broccoli',
          fridgeProtein: 'chicken',
          ingredients: [
            { name: 'Chicken breast (cooked)', grams: 140, kcal: 230, p: 43, c: 0,  f: 5 },
            { name: 'White rice (cooked)',     grams: 200, kcal: 260, p: 5,  c: 56, f: 1 },
            { name: 'Broccoli',                grams: 100, kcal: 35,  p: 3,  c: 7,  f: 0 }
          ]
        },
        {
          id: 'l-turkey-sweetpotato',
          name: 'Turkey + Sweet Potato + Greens',
          fridgeProtein: 'turkey',
          ingredients: [
            { name: 'Ground turkey 93/7 (cooked)', grams: 140, kcal: 245, p: 31, c: 0,  f: 13 },
            { name: 'Sweet potato (cooked)',       grams: 200, kcal: 170, p: 3,  c: 40, f: 0 },
            { name: 'Mixed greens',                grams: 50,  kcal: 10,  p: 1,  c: 2,  f: 0 }
          ]
        },
        {
          id: 'l-chicken-quinoa',
          name: 'Chicken + Quinoa + Spinach',
          fridgeProtein: 'chicken',
          ingredients: [
            { name: 'Chicken breast (cooked)', grams: 140, kcal: 230, p: 43, c: 0,  f: 5 },
            { name: 'Quinoa (cooked)',         grams: 185, kcal: 220, p: 8,  c: 39, f: 4 },
            { name: 'Spinach',                 grams: 50,  kcal: 12,  p: 1,  c: 2,  f: 0 }
          ]
        }
      ],
      weekly: [null, A.rice50, A.rice50, A.rice50, A.riceOil, A.riceOil, A.riceOil, A.riceOil]
    },

    '6pm': {
      slot: '6pm',
      time: '6:00 PM',
      label: 'Dinner',
      tag: null,
      fridgeProtein: 'chicken',
      options: [
        {
          id: 'd-chicken-rice',
          name: 'Chicken + Rice + Broccoli',
          fridgeProtein: 'chicken',
          ingredients: [
            { name: 'Chicken breast (cooked)', grams: 140, kcal: 230, p: 43, c: 0,  f: 5 },
            { name: 'White rice (cooked)',     grams: 150, kcal: 195, p: 4,  c: 42, f: 0 },
            { name: 'Broccoli',                grams: 150, kcal: 50,  p: 4,  c: 10, f: 0 }
          ]
        },
        {
          id: 'd-turkey-russet',
          name: 'Turkey + Russet + Zucchini',
          fridgeProtein: 'turkey',
          ingredients: [
            { name: 'Ground turkey 93/7 (cooked)', grams: 140, kcal: 245, p: 31, c: 0,  f: 13 },
            { name: 'Russet potato (baked)',       grams: 200, kcal: 185, p: 4,  c: 42, f: 0 },
            { name: 'Zucchini',                    grams: 100, kcal: 17,  p: 1,  c: 3,  f: 0 }
          ]
        },
        {
          id: 'd-chicken-sweetpotato',
          name: 'Chicken + Sweet Potato + Asparagus',
          fridgeProtein: 'chicken',
          ingredients: [
            { name: 'Chicken breast (cooked)', grams: 140, kcal: 230, p: 43, c: 0,  f: 5 },
            { name: 'Sweet potato (cooked)',   grams: 200, kcal: 170, p: 3,  c: 40, f: 0 },
            { name: 'Asparagus',               grams: 100, kcal: 20,  p: 2,  c: 4,  f: 0 }
          ]
        }
      ],
      weekly: [null, null, null, null, null, null, null, null]
    }
  };

  /* ----------------------------------------------------------
     PREP GUIDE — Sun-for-Mon-Thu and Thu-for-Fri-Sun split
     ---------------------------------------------------------- */
  const PREP_GUIDE = {
    sunday: {
      dayBadge: 'SUN',
      label: 'Sunday prep',
      forDays: 'Mon → Thu',
      cookCount: '4 lunches + 4 dinners',
      coverage: ['Mon', 'Tue', 'Wed', 'Thu'],
      steps: [
        { what: 'Brown rice / White rice', qty: '3 cups dry → 6 cups cooked', method: 'Cool ≤2h · fridge in shallow containers' },
        { what: 'Sweet potatoes',          qty: '4 medium, scrubbed',         method: '400°F · 45 min · until fork-soft' },
        { what: 'Chicken breast',          qty: '2 lbs · dry-brined 30 min',  method: 'Sear + bake 375°F · 22 min · 165°F internal' },
        { what: 'Ground turkey 93/7',      qty: '1 lb',                       method: 'Brown in skillet w/ seasoning · drain · cool' },
        { what: 'Broccoli + asparagus',    qty: '2 heads + 1 bunch',          method: 'Steam 4–5 min · shock in cold water' }
      ],
      assemble: 'Pack 4 lunch + 4 dinner. Label day + slot.'
    },
    thursday: {
      dayBadge: 'THU',
      label: 'Thursday prep',
      forDays: 'Fri → Sun',
      cookCount: '3 lunches + 3 dinners',
      coverage: ['Fri', 'Sat', 'Sun'],
      steps: [
        { what: 'Quinoa',             qty: '1.5 cups dry → 4.5 cups cooked', method: 'Cool ≤2h before fridge' },
        { what: 'Chicken breast',     qty: '1.5 lbs',                        method: 'Same as Sunday · 375°F · 22 min · 165°F internal' },
        { what: 'Russet potatoes',    qty: '3 medium',                       method: 'Bake 400°F · 45 min · OR air-fry 380°F · 30 min' },
        { what: 'Zucchini + spinach', qty: '2–3 zucchini + 1 bag spinach',   method: 'Prep fresh day-of · 5-min sauté' }
      ],
      assemble: 'Pack 3 lunch + 3 dinner. Greens go in last to prevent wilting.'
    },
    safety: 'Cooked rice & poultry: max 5 days fridge at ≤40°F. Discard at Day 5 even if it looks fine.'
  };

  // Public surface
  window.SHREDDED_MEALS = MEALS;
  window.SHREDDED_PREP_GUIDE = PREP_GUIDE;
})();