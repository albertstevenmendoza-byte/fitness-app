/* ============================================================
   SHREDDED — Grocery Database (Phase 6 data)
   ------------------------------------------------------------
   Six categories. Each item has:
     slug:  matches meals_data.js ingredient slugs (after the
            normalize-and-strip-parens transform in meals.js)
     name:  display label
     qty:   weekly quantity recommendation
     note:  optional context (e.g., "Wk 5+" or shelf life)
     freshGrab: true = no fridge tracking, grab fresh daily
   ============================================================ */
(function () {
  'use strict';

  const GROCERY = {
    proteins: {
      label: 'Proteins',
      hint: 'Cook on Sunday + Thursday',
      items: [
        { slug: 'chicken-breast',      name: 'Chicken breast',      qty: '~3.5 lbs raw',     note: 'Backbone of lunch + dinner — sear & bake to 165°F' },
        { slug: 'ground-turkey-93-7',  name: 'Ground turkey 93/7',  qty: '1 lb',             note: 'For lunch B + dinner B' },
        { slug: 'egg-whites',          name: 'Egg whites',          qty: '32 oz carton',     note: 'For breakfast option 2' }
      ]
    },
    dairy: {
      label: 'Dairy',
      hint: 'Buy weekly, no batch cook',
      items: [
        { slug: 'greek-yogurt-0',      name: 'Greek yogurt 0%',     qty: '32 oz tub',        note: 'For snack option 2' },
        { slug: 'cottage-cheese-2',    name: 'Cottage cheese 2%',   qty: '16 oz tub',        note: 'For snack option 3' }
      ]
    },
    carbs: {
      label: 'Carbs',
      hint: 'Pantry staples + fresh fruit',
      items: [
        { slug: 'rolled-oats',         name: 'Rolled oats',         qty: '16 oz canister',   note: 'Pantry, lasts 3+ weeks' },
        { slug: 'white-rice',          name: 'White rice',          qty: '2 lbs dry',        note: 'Pantry, lasts 4+ weeks' },
        { slug: 'quinoa',              name: 'Quinoa',              qty: '1 lb dry',         note: 'Pantry, lasts 4+ weeks' },
        { slug: 'sweet-potato',        name: 'Sweet potato',        qty: '~3 lbs (4 med)',   note: 'Bake Sunday at 400°F · 45 min' },
        { slug: 'russet-potato',       name: 'Russet potato',       qty: '~2 lbs (3 med)',   note: 'Bake or air-fry Thursday' },
        { slug: 'banana',              name: 'Banana',              qty: '7 fresh',          note: 'Grab fresh daily — pre-WO carb', freshGrab: true },
        { slug: 'pineapple',           name: 'Pineapple',           qty: '1 small or pre-cut cup' },
        { slug: 'mixed-berries',       name: 'Mixed berries',       qty: '1 lb',             note: 'Frozen works fine' }
      ]
    },
    veg: {
      label: 'Veg',
      hint: 'Steam ahead or fresh',
      items: [
        { slug: 'broccoli',            name: 'Broccoli',            qty: '2 heads',          note: 'Steam 4–5 min, shock cold' },
        { slug: 'asparagus',           name: 'Asparagus',           qty: '1 bunch',          note: 'Trim woody ends · steam 3–4 min' },
        { slug: 'zucchini',            name: 'Zucchini',            qty: '2–3 medium',       note: 'Sauté day-of, 5 min' },
        { slug: 'mixed-greens',        name: 'Mixed greens',        qty: '1 large container', note: 'Add fresh, last minute' },
        { slug: 'spinach',             name: 'Spinach',             qty: '1 bag/box',        note: 'Wilt fresh into bowls' }
      ]
    },
    fats: {
      label: 'Fats',
      hint: 'Drives the calorie ramp',
      items: [
        { slug: 'almonds',             name: 'Almonds',             qty: '1 lb bag',         note: 'Wk 4+ snack add (1 oz/day)', weekStart: 4 },
        { slug: 'olive-oil',           name: 'Olive oil',           qty: '1 bottle',         note: 'Wk 5+ on lunch veg (1 tbsp)', weekStart: 5 },
        { slug: 'fit-butter',          name: 'Fit butter',          qty: '1 jar',            note: 'Wk 7+ breakfast topping', weekStart: 7 }
      ]
    },
    supps: {
      label: 'Supps',
      hint: 'Replenish monthly',
      items: [
        { slug: 'whey-protein',        name: 'Whey protein',        qty: '1 tub',            note: '~30 servings · monthly' }
      ]
    }
  };

  // Public surface
  window.SHREDDED_GROCERY = GROCERY;

  // Canonical slugify helper — also exposed for cross-module use
  window.SHREDDED = window.SHREDDED || {};
  window.SHREDDED.slugify = (name) => {
    const cleaned = String(name).replace(/\([^)]*\)/g, '').trim();
    return cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
})();