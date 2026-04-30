/**
 * ═══════════════════════════════════════════════════════════
 * APEX FITNESS — app.js
 * 
 * Responsibilities:
 *   1. Supabase client initialization
 *   2. Unit conversion (lbs → kg, in → cm)
 *   3. BMR calculation (Mifflin-St Jeor)
 *   4. TDEE calculation (Harris-Benedict activity multipliers)
 *   5. Goal-based calorie targeting
 *   6. Macro calculation (protein, fat, carbs)
 *   7. Workout split generation
 *   8. DOM rendering of results dashboard
 *   9. Form validation
 *  10. Supabase INSERT of user profile + plan
 * ═══════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────
   1. SUPABASE INITIALIZATION
   ─────────────────────────────────────────────────────────
   ⚠️  IMPORTANT: Replace these placeholder values with your
       actual Supabase project URL and anon key.
       
       Find them at: supabase.com → your project →
       Settings → API → Project URL & anon key
   ───────────────────────────────────────────────────────── */
const SUPABASE_URL  = 'https://jcxbxdlghcvrnoayzsur.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjeGJ4ZGxnaGN2cm5vYXl6c3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTg0MDcsImV4cCI6MjA5MzEzNDQwN30.Esu4odZnhTWra4sxQLpIuAY9ZyF7zmIlNceSCsAEo3k';

// Initialize the Supabase client
// The global `supabase` object is injected by the CDN script tag
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


/* ─────────────────────────────────────────────────────────
   2. CONSTANTS & CONFIGURATION
   ───────────────────────────────────────────────────────── */

/** Activity level multipliers (from Harris-Benedict research) */
const ACTIVITY_LABELS = {
  '1.2':   'Sedentary',
  '1.375': 'Lightly Active',
  '1.55':  'Moderately Active',
  '1.725': 'Very Active',
  '1.9':   'Extremely Active',
};

/** Calorie surplus/deficit by goal */
const GOAL_CONFIG = {
  lean_bulk: {
    label:        'Lean Bulk Protocol',
    surplusKcal:  300,
    surplusLabel: '+300 kcal lean bulk surplus',
    proteinPerKg: 2.0,   // g/kg — midpoint of 1.8–2.2 for lean bulking
    fatPerKg:     0.9,   // g/kg — midpoint of 0.8–1.0
  },
  aggressive_bulk: {
    label:        'Aggressive Bulk Protocol',
    surplusKcal:  500,
    surplusLabel: '+500 kcal aggressive bulk surplus',
    proteinPerKg: 1.8,   // g/kg — slightly lower; carbs more important for energy
    fatPerKg:     1.0,   // g/kg — upper end for hormonal support
  },
  recomp: {
    label:        'Body Recomposition Protocol',
    surplusKcal:  0,
    surplusLabel: 'Maintenance calories (recomp)',
    proteinPerKg: 2.2,   // g/kg — highest; preserving muscle during recomp
    fatPerKg:     0.8,   // g/kg — lower end; preserve carbs for training
  },
};

/** Weekly workout splits by goal */
const WORKOUT_SPLITS = {
  lean_bulk: {
    name:     'Push / Pull / Legs (PPL) — 6-Day',
    subtitle: 'High-frequency PPL maximizes weekly muscle stimulus while managing fatigue.',
    days: [
      { label: 'Monday',    type: 'PUSH',    focus: 'Chest, Front/Side Delts, Triceps' },
      { label: 'Tuesday',   type: 'PULL',    focus: 'Back (width & thickness), Biceps, Rear Delts' },
      { label: 'Wednesday', type: 'LEGS',    focus: 'Quads, Hamstrings, Glutes, Calves' },
      { label: 'Thursday',  type: 'PUSH',    focus: 'Chest (volume focus), Shoulders, Triceps' },
      { label: 'Friday',    type: 'PULL',    focus: 'Back (strength focus), Biceps, Rear Delts' },
      { label: 'Saturday',  type: 'LEGS',    focus: 'Posterior chain focus, Glutes, Calves' },
      { label: 'Sunday',    type: 'REST',    focus: 'Active recovery, mobility work' },
    ],
    principles: [
      'Train each muscle group 2× per week for maximum MPS frequency',
      '3–4 working sets per exercise, 8–12 reps for hypertrophy',
      'Progressive overload: add weight or reps every session',
      'Rest 60–90 sec between sets for metabolic stress adaptation',
      'Compound lifts first (bench, row, squat), isolation last',
      'Deload week every 6–8 weeks to prevent overreaching',
    ],
  },
  aggressive_bulk: {
    name:     'Upper / Lower Split — 4-Day',
    subtitle: 'Strength-focused split with high loading and ample recovery for maximum mass gain.',
    days: [
      { label: 'Monday',    type: 'UPPER A', focus: 'Strength focus — Bench, Row, Overhead Press, Pull-ups' },
      { label: 'Tuesday',   type: 'LOWER A', focus: 'Strength focus — Squat, Romanian Deadlift, Leg Press' },
      { label: 'Wednesday', type: 'REST',    focus: 'Full recovery — sleep and eat aggressively' },
      { label: 'Thursday',  type: 'UPPER B', focus: 'Hypertrophy — Incline DB, Cable Row, Lateral Raises' },
      { label: 'Friday',    type: 'LOWER B', focus: 'Hypertrophy — Leg Extension, Leg Curl, Hip Thrust' },
      { label: 'Saturday',  type: 'REST',    focus: 'Optional: light cardio, stretching' },
      { label: 'Sunday',    type: 'REST',    focus: 'Full rest — recovery is when you grow' },
    ],
    principles: [
      'Prioritize compound lifts: they drive the most hypertrophy',
      'A days: 3–6 reps heavy. B days: 8–15 reps moderate',
      'Progressive overload is non-negotiable — track every lift',
      'Eat within 2 hours post-training for optimal MPS window',
      'Sleep 8–9 hours — growth hormone peaks during deep sleep',
      'Minimize cardio to protect caloric surplus',
    ],
  },
  recomp: {
    name:     'Full-Body Training — 3-Day',
    subtitle: 'Full-body sessions maintain high-frequency stimulus while optimizing body composition.',
    days: [
      { label: 'Monday',    type: 'FULL A',  focus: 'Squat, Bench, Row, Overhead Press — strength focus' },
      { label: 'Tuesday',   type: 'REST',    focus: 'Active recovery: 20-min walk, stretching' },
      { label: 'Wednesday', type: 'FULL B',  focus: 'Deadlift, Incline DB, Pull-ups, Dips — volume focus' },
      { label: 'Thursday',  type: 'REST',    focus: 'Zone 2 cardio 20–30 min (supports recomp)' },
      { label: 'Friday',    type: 'FULL C',  focus: 'Hip Thrust, DB Press, Cable Row — metabolic focus' },
      { label: 'Saturday',  type: 'CARDIO',  focus: 'LISS cardio 30–40 min — enhances fat oxidation' },
      { label: 'Sunday',    type: 'REST',    focus: 'Full rest and recovery' },
    ],
    principles: [
      'Prioritize protein synthesis with high-volume, moderate-load work',
      'Zone 2 cardio accelerates fat loss without impairing MPS',
      'Calorie cycling: eat more on training days, less on rest days',
      'Track weight and progress photos weekly — recomp is slow',
      'Never skip a session — consistency beats intensity for recomp',
      'Focus on the mind-muscle connection; quality reps over ego lifts',
    ],
  },
};


/* ─────────────────────────────────────────────────────────
   3. UNIT CONVERSION UTILITIES
   ───────────────────────────────────────────────────────── */

/**
 * Convert pounds to kilograms.
 * @param {number} lbs
 * @returns {number} kg (2 decimal places)
 */
function lbsToKg(lbs) {
  return parseFloat((lbs * 0.453592).toFixed(2));
}

/**
 * Convert inches to centimeters.
 * @param {number} inches
 * @returns {number} cm
 */
function inToCm(inches) {
  return parseFloat((inches * 2.54).toFixed(1));
}


/* ─────────────────────────────────────────────────────────
   4. SCIENTIFIC CALCULATIONS
   ───────────────────────────────────────────────────────── */

/**
 * Calculate Basal Metabolic Rate using the Mifflin-St Jeor equation.
 * 
 * Mifflin MD, St Jeor ST, et al. (1990). "A new predictive equation for
 * resting energy expenditure in healthy individuals." AJCN, 51(2), 241–247.
 * 
 * Male:   BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5
 * Female: BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161
 * 
 * @param {number} weightKg   - Body weight in kg
 * @param {number} heightCm   - Height in cm
 * @param {number} age        - Age in years
 * @param {string} gender     - 'male' | 'female'
 * @returns {number} BMR in kcal/day (rounded to nearest integer)
 */
function calcBMR(weightKg, heightCm, age, gender) {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  const sexOffset = gender === 'male' ? 5 : -161;
  return Math.round(base + sexOffset);
}

/**
 * Calculate Total Daily Energy Expenditure.
 * TDEE = BMR × activity multiplier
 * 
 * @param {number} bmr              - Basal Metabolic Rate
 * @param {number} activityMultiplier - Float from 1.2 to 1.9
 * @returns {number} TDEE in kcal/day (rounded)
 */
function calcTDEE(bmr, activityMultiplier) {
  return Math.round(bmr * activityMultiplier);
}

/**
 * Calculate target daily calories based on goal.
 * 
 * @param {number} tdee     - Total Daily Energy Expenditure
 * @param {string} goal     - 'lean_bulk' | 'aggressive_bulk' | 'recomp'
 * @returns {number} target calories/day
 */
function calcTargetCalories(tdee, goal) {
  return tdee + GOAL_CONFIG[goal].surplusKcal;
}

/**
 * Calculate macronutrient targets.
 * 
 * Priority order (avoid skinflint carb allocation):
 *   1. Protein: set at proteinPerKg × weightKg
 *      Rationale: Morton et al. (2018) — 0.73 g/lb (1.6 g/kg) is the
 *      minimum effective dose; 2.2 g/kg is the upper effective limit.
 *   2. Fat: set at fatPerKg × weightKg
 *      Rationale: Dietary fat is essential for testosterone, cortisol,
 *      and fat-soluble vitamins (A, D, E, K). Never below 0.8 g/kg.
 *   3. Carbohydrates: remaining calories ÷ 4
 *      Rationale: Primary fuel for glycolytic training; leftover
 *      after protein and fat floors are met.
 * 
 * Caloric values: Protein = 4 kcal/g, Carbs = 4 kcal/g, Fat = 9 kcal/g
 * 
 * @param {number} targetKcal - Target daily calories
 * @param {number} weightKg   - Body weight in kg
 * @param {string} goal       - Goal key
 * @returns {{ protein, fat, carbs, proteinKcal, fatKcal, carbsKcal,
 *             proteinPct, fatPct, carbsPct }}
 */
function calcMacros(targetKcal, weightKg, goal) {
  const cfg = GOAL_CONFIG[goal];

  // Protein
  const proteinG    = Math.round(cfg.proteinPerKg * weightKg);
  const proteinKcal = proteinG * 4;

  // Fat
  const fatG    = Math.round(cfg.fatPerKg * weightKg);
  const fatKcal = fatG * 9;

  // Carbs — whatever is left
  const carbsKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
  const carbsG    = Math.round(carbsKcal / 4);

  // Percentage of total calories
  const total      = proteinKcal + fatKcal + carbsKcal;
  const proteinPct = Math.round((proteinKcal / total) * 100);
  const fatPct     = Math.round((fatKcal     / total) * 100);
  const carbsPct   = 100 - proteinPct - fatPct;

  return {
    proteinG, fatG, carbsG,
    proteinKcal, fatKcal, carbsKcal,
    proteinPct, fatPct, carbsPct,
    proteinPerKg: cfg.proteinPerKg,
    fatPerKg:     cfg.fatPerKg,
  };
}


/* ─────────────────────────────────────────────────────────
   5. DOM RENDERING
   ───────────────────────────────────────────────────────── */

/**
 * Populate the results dashboard with calculated values.
 * Animates macro bars after a short delay for visual effect.
 * 
 * @param {object} data - All calculated values + original inputs
 */
function renderResults(data) {
  const {
    bmr, tdee, targetKcal, currentCalories, goal,
    macros, weightKg,
  } = data;

  const cfg = GOAL_CONFIG[goal];
  const split = WORKOUT_SPLITS[goal];

  // ── Goal name ──
  document.getElementById('results-goal-name').textContent = cfg.label;

  // ── Metabolism metrics ──
  document.getElementById('bmr-value').textContent    = bmr.toLocaleString();
  document.getElementById('tdee-value').textContent   = tdee.toLocaleString();
  document.getElementById('target-value').textContent = targetKcal.toLocaleString();
  document.getElementById('target-note').textContent  = cfg.surplusLabel;

  const adjustment = targetKcal - currentCalories;
  const adjEl = document.getElementById('adjustment-value');
  adjEl.textContent = (adjustment >= 0 ? '+' : '') + adjustment.toLocaleString();
  adjEl.style.color = adjustment >= 0
    ? 'var(--acid)'
    : 'var(--rose)';
  document.getElementById('adjustment-note').textContent =
    adjustment >= 0
      ? `eat ${adjustment} more kcal than currently`
      : `eat ${Math.abs(adjustment)} fewer kcal than currently`;

  // ── Macros ──
  // Protein
  document.getElementById('protein-g').textContent      = `${macros.proteinG} g`;
  document.getElementById('protein-kcal').textContent   = `${macros.proteinKcal} kcal`;
  document.getElementById('protein-pct').textContent    = `${macros.proteinPct}%`;
  document.getElementById('protein-per-kg').textContent = macros.proteinPerKg.toFixed(1);

  // Fat
  document.getElementById('fat-g').textContent          = `${macros.fatG} g`;
  document.getElementById('fat-kcal').textContent       = `${macros.fatKcal} kcal`;
  document.getElementById('fat-pct').textContent        = `${macros.fatPct}%`;
  document.getElementById('fat-per-kg').textContent     = macros.fatPerKg.toFixed(1);

  // Carbs
  document.getElementById('carb-g').textContent         = `${macros.carbsG} g`;
  document.getElementById('carb-kcal').textContent      = `${macros.carbsKcal} kcal`;
  document.getElementById('carb-pct').textContent       = `${macros.carbsPct}%`;

  // Animate macro bars after short delay
  setTimeout(() => {
    document.getElementById('protein-bar').style.width = `${macros.proteinPct}%`;
    document.getElementById('fat-bar').style.width     = `${macros.fatPct}%`;
    document.getElementById('carb-bar').style.width    = `${macros.carbsPct}%`;
  }, 200);

  // ── Science explanation ──
  renderScienceContent(data);

  // ── Workout split ──
  renderWorkoutSplit(split);

  // ── Step indicator ──
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelector('.step[data-step="2"]').classList.add('active');

  // ── Show results, hide form ──
  document.getElementById('form-section').classList.add('hidden');
  document.getElementById('results-section').classList.remove('hidden');

  // Scroll to top of results
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Render the "Why These Numbers?" science explanation blocks.
 */
function renderScienceContent(data) {
  const { bmr, tdee, targetKcal, weightKg, activityMultiplier, goal, macros } = data;
  const cfg = GOAL_CONFIG[goal];
  const actLabel = ACTIVITY_LABELS[String(activityMultiplier)] || activityMultiplier;

  const blocks = [
    {
      title: '🧮 Mifflin-St Jeor Equation',
      body: `Your BMR of ${bmr.toLocaleString()} kcal is the energy your body requires at complete rest — just to sustain breathing, circulation, and cellular function. The Mifflin-St Jeor equation (1990) is the most accurate non-calorimetric predictor of RMR, validated in diverse populations and preferred by registered dietitians over the older Harris-Benedict formula.`,
    },
    {
      title: '⚡ Your TDEE & Activity Multiplier',
      body: `Multiplying your BMR by ${activityMultiplier} (${actLabel}) gives a TDEE of ${tdee.toLocaleString()} kcal — your true daily caloric burn when training is accounted for. Activity multipliers are validated averages; if you find yourself gaining or losing weight unexpectedly, adjust by ±100 kcal every 1–2 weeks.`,
    },
    {
      title: `🎯 Why ${cfg.surplusKcal > 0 ? '+' + cfg.surplusKcal : '0'} kcal For ${goal === 'recomp' ? 'Recomp' : goal === 'lean_bulk' ? 'Lean Bulk' : 'Aggressive Bulk'}?`,
      body: goal === 'lean_bulk'
        ? `A +300 kcal surplus provides enough substrate for muscle protein synthesis without excessive fat gain. Beginner studies show muscle gain requires as few as +200 kcal; +300 provides a buffer for measurement error while keeping the "clean bulk" goal realistic.`
        : goal === 'aggressive_bulk'
        ? `A +500 kcal surplus maximizes anabolic conditions — high circulating insulin, mTOR activation, and glycogen saturation all drive muscle growth. The trade-off is faster fat accumulation (~0.5–1 lb/week), acceptable for those prioritizing mass over leanness.`
        : `At maintenance calories, body recomposition leverages a "within-day energy deficit" — amino acids are preferentially shuttled into muscle while body fat fuels the overall energy balance. This is most effective for beginners, detrained individuals, and those with >18% body fat.`,
    },
    {
      title: '🥩 Protein Target Rationale',
      body: `Your target of ${macros.proteinG}g/day (${macros.proteinPerKg} g/kg) is based on Morton et al. (2018) — a meta-analysis of 49 studies showing the muscle-building effect of protein plateaus at ~1.62 g/kg in trained individuals. Higher intakes (up to 2.2 g/kg) are safe and may provide marginal benefits while increasing satiety, which is especially useful during aggressive bulking when total food volume is high.`,
    },
  ];

  const container = document.getElementById('science-content');
  container.innerHTML = blocks.map(b => `
    <div class="science-block">
      <h4>${b.title}</h4>
      <p>${b.body}</p>
    </div>
  `).join('');
}

/**
 * Render the weekly workout split grid.
 * @param {object} split - Workout split config object
 */
function renderWorkoutSplit(split) {
  document.getElementById('split-subtitle').textContent = split.subtitle;

  const splitEl = document.getElementById('workout-split');
  splitEl.innerHTML = split.days.map(day => {
    const isRest = day.type === 'REST';
    return `
      <div class="split-day ${isRest ? 'rest-day' : ''}">
        <span class="day-label">${day.label}</span>
        <span class="day-type">${day.type}</span>
        <span class="day-focus">${day.focus}</span>
      </div>
    `;
  }).join('');

  const principlesEl = document.getElementById('principles-list');
  principlesEl.innerHTML = split.principles
    .map(p => `<li>${p}</li>`)
    .join('');
}


/* ─────────────────────────────────────────────────────────
   6. SUPABASE DATABASE INTEGRATION
   ───────────────────────────────────────────────────────── */

/**
 * Save the user's profile and generated plan to Supabase.
 * 
 * The schema is defined in schema.sql — run that first in the
 * Supabase SQL Editor before this function will succeed.
 * 
 * @param {object} inputs  - Raw form inputs (weight, height, age, etc.)
 * @param {object} results - Calculated values (bmr, tdee, macros, etc.)
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function savePlanToSupabase(inputs, results) {
  // Flatten everything into one flat row for the fitness_plans table
  const row = {
    // ── User demographics ──
    weight_kg:        results.weightKg,
    height_cm:        results.heightCm,
    age:              inputs.age,
    gender:           inputs.gender,
    activity_level:   parseFloat(inputs.activity),
    current_calories: results.currentCalories,
    goal:             inputs.goal,

    // ── Calculated energy metrics ──
    bmr:              results.bmr,
    tdee:             results.tdee,
    target_calories:  results.targetKcal,

    // ── Macros ──
    protein_g:        results.macros.proteinG,
    fat_g:            results.macros.fatG,
    carbs_g:          results.macros.carbsG,
    protein_kcal:     results.macros.proteinKcal,
    fat_kcal:         results.macros.fatKcal,
    carbs_kcal:       results.macros.carbsKcal,
    protein_pct:      results.macros.proteinPct,
    fat_pct:          results.macros.fatPct,
    carbs_pct:        results.macros.carbsPct,

    // ── Metadata ──
    workout_split:    WORKOUT_SPLITS[inputs.goal].name,
    created_at:       new Date().toISOString(),
  };

  try {
    const { data, error } = await db
      .from('fitness_plans')
      .insert([row]);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error('[Supabase] Insert failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update the save-status UI element.
 * @param {'loading'|'success'|'error'} state
 * @param {string} message
 */
function setSaveStatus(state, message) {
  const el = document.getElementById('save-status');
  el.className = `save-status ${state}`;
  el.textContent = message;
  el.style.display = 'block';
}


/* ─────────────────────────────────────────────────────────
   7. FORM VALIDATION
   ───────────────────────────────────────────────────────── */

/**
 * Validate all form fields.
 * Shows inline error messages and returns false if invalid.
 * @returns {boolean} isValid
 */
function validateForm() {
  let isValid = true;

  // Helper: set or clear an error
  function setError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (message) {
      error.textContent = message;
      input.classList.add('invalid');
      isValid = false;
    } else {
      error.textContent = '';
      input.classList.remove('invalid');
    }
  }

  // Weight
  const weight = parseFloat(document.getElementById('weight').value);
  const weightUnit = document.querySelector('.unit-btn.active[data-field="weight"]')?.dataset.unit;
  const weightKg = weightUnit === 'lbs' ? lbsToKg(weight) : weight;
  if (!weight || weightKg < 30 || weightKg > 300) {
    setError('weight', 'weight-error', 'Enter a valid weight (30–300 kg or equivalent in lbs).');
  } else {
    setError('weight', 'weight-error', null);
  }

  // Height
  const height = parseFloat(document.getElementById('height').value);
  const heightUnit = document.querySelector('.unit-btn.active[data-field="height"]')?.dataset.unit;
  const heightCm = heightUnit === 'in' ? inToCm(height) : height;
  if (!height || heightCm < 100 || heightCm > 280) {
    setError('height', 'height-error', 'Enter a valid height (100–280 cm or equivalent in inches).');
  } else {
    setError('height', 'height-error', null);
  }

  // Age
  const age = parseInt(document.getElementById('age').value);
  if (!age || age < 14 || age > 100) {
    setError('age', 'age-error', 'Enter a valid age between 14 and 100.');
  } else {
    setError('age', 'age-error', null);
  }

  // Current calories
  const calories = parseInt(document.getElementById('current-calories').value);
  if (!calories || calories < 800 || calories > 8000) {
    setError('current-calories', 'calories-error', 'Enter a realistic calorie intake (800–8000 kcal).');
  } else {
    setError('current-calories', 'calories-error', null);
  }

  // Activity level
  const activity = document.getElementById('activity').value;
  const actError = document.getElementById('activity-error');
  if (!activity) {
    actError.textContent = 'Please select your activity level.';
    isValid = false;
  } else {
    actError.textContent = '';
  }

  return isValid;
}


/* ─────────────────────────────────────────────────────────
   8. UNIT TOGGLE BUTTONS
   ───────────────────────────────────────────────────────── */

/**
 * Handle unit toggle (kg/lbs, cm/in).
 * Converts the current input value on toggle.
 */
function initUnitToggles() {
  document.querySelectorAll('.unit-toggle').forEach(group => {
    group.querySelectorAll('.unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field    = btn.dataset.field;
        const newUnit  = btn.dataset.unit;
        const prevBtn  = group.querySelector('.unit-btn.active');
        const prevUnit = prevBtn?.dataset.unit;

        if (newUnit === prevUnit) return; // No change

        // Convert existing value if present
        const input = document.getElementById(field);
        const val   = parseFloat(input.value);

        if (val && !isNaN(val)) {
          if (field === 'weight') {
            input.value = newUnit === 'lbs'
              ? parseFloat((val / 0.453592).toFixed(1))
              : parseFloat((val * 0.453592).toFixed(1));
          } else if (field === 'height') {
            input.value = newUnit === 'in'
              ? parseFloat((val / 2.54).toFixed(1))
              : parseFloat((val * 2.54).toFixed(0));
          }
        }

        // Update placeholder
        if (field === 'weight') {
          input.placeholder = newUnit === 'lbs' ? '165' : '75';
        } else if (field === 'height') {
          input.placeholder = newUnit === 'in' ? '70' : '178';
        }

        // Toggle active state
        prevBtn?.classList.remove('active');
        btn.classList.add('active');
      });
    });
  });
}


/* ─────────────────────────────────────────────────────────
   9. FORM SUBMIT HANDLER
   ───────────────────────────────────────────────────────── */

document.getElementById('fitness-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validate
  if (!validateForm()) return;

  // Read inputs
  const weightRaw   = parseFloat(document.getElementById('weight').value);
  const heightRaw   = parseFloat(document.getElementById('height').value);
  const age         = parseInt(document.getElementById('age').value);
  const gender      = document.querySelector('input[name="gender"]:checked').value;
  const currentCals = parseInt(document.getElementById('current-calories').value);
  const activity    = parseFloat(document.getElementById('activity').value);
  const goal        = document.querySelector('input[name="goal"]:checked').value;

  // Convert to metric if needed
  const weightUnit = document.querySelector('.unit-btn.active[data-field="weight"]')?.dataset.unit;
  const heightUnit = document.querySelector('.unit-btn.active[data-field="height"]')?.dataset.unit;
  const weightKg   = weightUnit === 'lbs' ? lbsToKg(weightRaw) : weightRaw;
  const heightCm   = heightUnit === 'in'  ? inToCm(heightRaw) : heightRaw;

  // ── Run all calculations ──
  const bmr        = calcBMR(weightKg, heightCm, age, gender);
  const tdee       = calcTDEE(bmr, activity);
  const targetKcal = calcTargetCalories(tdee, goal);
  const macros     = calcMacros(targetKcal, weightKg, goal);

  // Bundle all results
  const inputs = { weightRaw, heightRaw, age, gender, activity, goal };
  const results = {
    weightKg,
    heightCm,
    currentCalories: currentCals,
    activityMultiplier: activity,
    bmr,
    tdee,
    targetKcal,
    macros,
    goal,
  };

  // ── Render dashboard ──
  renderResults({ ...results, currentCalories: currentCals });

  // ── Save to Supabase ──
  setSaveStatus('loading', '⟳ Saving your plan to the cloud...');

  const { success, error } = await savePlanToSupabase(inputs, results);

  if (success) {
    setSaveStatus(
      'success',
      '✓ Plan saved successfully. Your data is stored in Supabase.'
    );
  } else {
    // Show error but don't block the user from seeing their plan
    setSaveStatus(
      'error',
      `⚠ Cloud save failed: ${error}. Check your Supabase credentials in app.js.`
    );
  }
});


/* ─────────────────────────────────────────────────────────
   10. RECALCULATE BUTTON
   ───────────────────────────────────────────────────────── */

document.getElementById('recalculate-btn').addEventListener('click', () => {
  // Show form, hide results
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('form-section').classList.remove('hidden');
  document.getElementById('save-status').textContent = '';
  document.getElementById('save-status').className = 'save-status';

  // Reset step indicator
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelector('.step[data-step="1"]').classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
});


/* ─────────────────────────────────────────────────────────
   11. INITIALIZATION
   ───────────────────────────────────────────────────────── */
(function init() {
  initUnitToggles();

  // Clear validation errors on input
  ['weight', 'height', 'age', 'current-calories'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        el.classList.remove('invalid');
        const errEl = document.getElementById(`${id}-error`);
        if (errEl) errEl.textContent = '';
      });
    }
  });
})();
