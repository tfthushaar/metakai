# Metakai — Product & Technical Plan

> One-stop app for building the body you want: cut, bulk, recomp or maintain.
> Nutrition, training, body composition, recovery and progress in one place.
> Android APK first, iOS later.
> Repo: https://github.com/tfthushaar/metakai (public)
> Status: planning only — no implementation yet.

**Core idea:** tell Metakai the body you want. It works out the phases to get there (bulk, cut, recomp, maintain), sets calorie, macro and training targets for each one, predicts progress, and tracks what actually happens — food in plain language, fast gym logging, weight and body composition trends, photos and milestone cards.

**Hard constraints**
1. **$0 to build and run.** Free tiers and on-device processing only.
2. **Auth required.** User accounts, private data, sync across devices.
3. **Offline-first.** Works fully in the gym with no signal; the cloud is for sync and backup.
4. **No bloat.** Beyond a small core, every feature is a **module** the user can switch on or off (§6).

---

## Contents
1. Identity
2. What is free and what isn't
3. Tech stack
4. Architecture
5. **Goal & phase engine** (core)
6. Feature modules & customization
7. Auth & accounts
8. Features
9. Safety & responsible defaults
10. Data model
11. Screens
12. Repo layout
13. Roadmap
14. Deliberately out of scope
15. Open decisions

---

## 1. Identity

| Item | Value |
|---|---|
| App name | Metakai |
| Repo | `tfthushaar/metakai` |
| Android package ID | `com.tfthushaar.metakai` (cannot change after a Play Store release) |
| Expo slug / scheme | `metakai` / `metakai://` (auth redirect deep links) |
| Supabase project | `metakai` |

Before any public release, run a quick trademark and Play Store search for "Metakai".

---

## 2. What is free and what isn't

| Item | Free? | Notes |
|---|---|---|
| Android APK build + install | ✅ | Local Gradle or GitHub Actions |
| APK distribution | ✅ | GitHub Releases |
| Google Play Store | ❌ | $25 one-time. Optional. |
| iOS release | ❌ | Apple Developer Program is $99/year. The code stays iOS-ready. |
| Backend, DB, auth, storage | ✅ | Supabase free plan, within its limits |
| AI | ✅ | Free API tiers: rate-limited, and some may use prompts for training |
| Calculations, predictions, gym tools, GPS, pose detection | ✅ | All on-device |

Free-tier limits and data licenses change. Check them when setting up.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| App | **Expo (React Native + TypeScript)**, expo-router | Same codebase later builds for iOS |
| Local DB | SQLite (expo-sqlite) + Drizzle ORM | Source of truth on the device |
| Backend | **Supabase free plan** | Postgres, Auth, Storage, Edge Functions |
| Auth | **Supabase Auth** | Google OAuth, email + password, magic link |
| AI proxy | Supabase Edge Functions | Keeps API keys off the device |
| AI (primary) | **Google Gemini API free tier (Flash models)** | Food parsing, meal photos, coach, program and meal-plan builder |
| AI (fallback) | Groq free tier / OpenRouter free models | Automatic failover when rate-limited |
| Nutrition data | USDA FoodData Central, Open Food Facts, IFCT 2017 (bundled) | Check IFCT redistribution terms |
| Exercise library | **free-exercise-db** (~800 exercises, JSON + images), bundled | Check license; wger (CC-BY-SA) is the fallback |
| Cardio calories | Compendium of Physical Activities MET values | Public reference data |
| Formulas | Mifflin-St Jeor, Katch-McArdle, Epley/Brzycki, DOTS/Wilks/IPF GL, US Navy, Jackson-Pollock skinfolds, FFMI | Public formulas, computed locally |
| Barcode | expo-camera | On-device |
| Label OCR | Google ML Kit text recognition | On-device, free |
| Pose detection | Google ML Kit Pose Detection | On-device, free |
| Voice input | Android speech recognition (expo-speech-recognition) | On-device, free |
| GPS cardio | expo-location (+ background task) | Route as a plain line in the MVP; MapLibre + free tiles optional |
| Charts | Victory Native / react-native-skia | Open source |
| Body diagram | Inline SVG muscle map | Custom asset |
| Health data | Android Health Connect (HealthKit later) | Steps, heart rate, sleep, weight, body fat; workouts written back |
| Notifications | expo-notifications (local), ongoing notification for active workout | No server needed |
| Haptics / audio | expo-haptics, expo-av | Timer cues |
| Secure storage | expo-secure-store | Auth session tokens |
| App lock | expo-local-authentication | Fingerprint / face |
| Education content | Markdown articles bundled with the app | Offline, no CMS cost |
| CI / builds | **GitHub Actions** (free for public repos) | Signed APK → GitHub Release |
| Crash reporting | Sentry free developer plan | Optional |

### Why Supabase over Firebase
New Cloud Storage for Firebase buckets need the paid Blaze plan, and photos are core. Supabase covers auth, database, storage and functions on one free project.

### Free-tier risks and mitigations

| Risk | Mitigation |
|---|---|
| Supabase pauses free projects after ~7 days of inactivity | Scheduled GitHub Actions job pings the DB every few days |
| ~1 GB storage fills quickly | Full-size photos and videos stay on the device; only compressed photos (~150–250 KB WebP) sync. **Form videos never upload.** Optional backup to the user's own Google Drive. |
| AI rate limits | Parse cache, local food library first, Gemini → Groq fallback, per-user daily limit. All predictions, targets and set logging run locally without AI. |
| Free AI tiers may train on prompts | Only food text, meal photos and anonymised summaries are sent. Stated on the privacy screen. |
| Public repo leaks secrets | GitHub Actions secrets + Supabase secrets; `.env.example` only |
| Lost APK signing keystore | Stored in GitHub secrets **and** backed up offline |

---

## 4. Architecture

```
┌──────────────── Metakai Android app (Expo) ─────────────┐
│  Goal & phase engine ── targets, predictions, presets   │
│  Feature registry ───── which modules are visible        │
│  UI ── local SQLite (source of truth, offline)           │
│          └── sync engine (push/pull on updated_at)       │
│  On-device: OCR · pose · speech · barcode · GPS ·        │
│             timers · notifications · Health Connect      │
└──────────┬───────────────────────────────────────────────┘
           │ HTTPS + Supabase JWT
┌──────────▼──────────── Supabase (free plan) ─────────────┐
│  Auth │ Postgres + RLS │ Storage (compressed photos)      │
│  Edge Functions:                                          │
│    /parse-food  /photo-meal  /food-lookup                 │
│    /weekly-report  /coach  /program-builder  /meal-plan   │
│    /coach-share  /delete-account                          │
└───────────────────────────────────────────────────────────┘
GitHub Actions: build APK → Release │ keep-alive ping │ CI
```

### Sync design
- Every row has a UUID `id`, `user_id`, `updated_at`, `deleted_at` (soft delete).
- Push local changes, then pull server changes; **last write wins** on `updated_at`.
- All modules sync, **including hidden ones**, so turning a module off never loses data.
- Triggers: app open, app backgrounded, workout finished, every few minutes while in use.
- Sync status shown in the UI: synced / pending / offline.

---

## 5. Goal & phase engine (core)

Everything else — calorie targets, macros, training volume, predictions, milestone cards, dashboard, presets — reads from the active goal and phase.

### 5.1 Goal types

| Goal | What it means | Calories | Default rate | Success is measured by |
|---|---|---|---|---|
| **Cut** | Lose fat, keep muscle | Deficit | 0.5–1% body weight/week | Trend weight ↓, waist ↓, strength kept |
| **Lean bulk** | Gain muscle, limit fat | Small surplus | 0.25–0.5%/week (by experience) | Trend weight ↑ slowly, strength ↑, waist steady |
| **Standard bulk** | Faster gain, accepts more fat | Larger surplus | 0.5–1%/week | Strength ↑, weight ↑ |
| **Recomp** | Lose fat and gain muscle at once | Maintenance (or slight deficit) | Weight roughly flat | Waist ↓, strength ↑, body fat % ↓, photos |
| **Maintenance** | Hold current physique | Maintenance | Weight within a ±1–1.5 kg band | Weight inside band, strength stable |
| **Reverse diet** | Raise calories after a cut | Stepwise increases | +50–150 kcal/week | Calories ↑ with minimal weight change |
| **Diet break** | 1–2 week pause from a cut | Maintenance | Flat | Rest, then resume cut |
| **Mini cut** | Short, faster cut during a bulk | Larger deficit | 2–6 weeks | Fat ↓ quickly, strength kept |
| **Strength focus** | Get stronger, bodyweight secondary | Maintenance or surplus | Any | Estimated 1RMs ↑, competition totals |
| **Event prep** | Hit a look/weight by a date (photoshoot, wedding, show) | Planned backwards from the date | From the date | On track for date |

### 5.2 Physique goal builder ("the body I want")
1. **Current state:** weight, height, sex, age, estimated body fat % (visual guide, tape measurements, skinfolds, smart scale or DEXA), training experience.
2. **Target state:** target weight **and/or** target body fat %, optional target measurements (waist, arms, chest, shoulders) and strength goals.
3. Metakai calculates:
   - Current and target **lean mass** and **fat mass**
   - Lean mass that needs to be gained, and **FFMI** at the target, with a feasibility check (flags targets well beyond typical natural ranges)
   - **Recommended starting goal** (see 5.3)
   - **Phase sequence** and total timeline, e.g. *Recomp 12 wks → Lean bulk 20 wks → Cut 12 wks → Maintenance*
4. The user can accept, edit phase lengths/rates, or build the sequence by hand.

### 5.3 Goal recommender (starting point, user can override)
- Higher body fat (roughly men > 20%, women > 30%) → **Cut** first
- Lean (roughly men < 12–15%, women < 22–25%) and wants size → **Lean bulk**
- Beginner or returning lifter in the middle range → **Recomp**
- Happy with physique → **Maintenance**
- Long cut already done (12+ weeks) → **Diet break** or **Reverse diet**
- Shown with a short explanation of why, never forced.

### 5.4 Phase planner (timeline)
- Horizontal timeline of phases with start/end dates, rates and target weights
- Drag to resize phases; the predicted curve updates instantly
- **Auto-transition prompts:** "Cut goal reached — start diet break / maintenance / reverse diet?"
- Planned diet breaks inside long cuts (e.g. 1 week every 8–12 weeks)
- Mini cuts inside long bulks when a body fat or waist ceiling is hit
- **Event countdown:** planned backwards from the event date
- History of past phases with their results (start/end weight, waist, strength change, adherence)

### 5.5 Energy & macro targets per phase
- **BMR:** Mifflin-St Jeor by default; **Katch-McArdle** when body fat % is known
- **Starting TDEE** = BMR × activity multiplier (or step-based estimate)
- **Target calories** = TDEE ± (weekly rate × energy per kg ÷ 7)
- **Adaptive TDEE** replaces the estimate after ~2–3 weeks of logging (intake + trend weight)
- **Protein:** by goal and lean mass (e.g. cut 2.0–2.4 g/kg lean mass; bulk/recomp 1.6–2.2 g/kg bodyweight)
- **Fat:** floor at ~0.6–0.8 g/kg (hormonal health), user-adjustable
- **Carbs:** remaining calories, shifted toward training days if enabled
- **Fiber** by calories (~14 g per 1000 kcal)
- **Calorie cycling / weekly budget:** training vs rest days, weekend banking
- **Reverse diet schedule:** automatic weekly increments until the maintenance estimate
- Manual override for every number, with a "reset to recommended" button

### 5.6 Prediction models per goal
- **Cut:** week-by-week simulation with TDEE falling as weight drops, so the curve flattens; forecast band.
- **Bulk:** weight gain curve at the chosen surplus, plus a **predicted lean vs fat split** based on training experience (typical muscle gain: beginner ~1–1.5% body weight/month, intermediate ~0.5–1%, advanced ~0.25–0.5%). Warning when actual gain runs well above the rate that experience level can use.
- **Recomp:** weight shown as a flat band; the prediction focuses on **waist ↓, estimated 1RMs ↑ and body fat % ↓**, so progress is visible when the scale doesn't move.
- **Maintenance:** target band, with alerts when the trend leaves it.
- **Strength goals:** estimated 1RM trend projected forward to the target lift, with an ETA.
- **Measurement goals:** arm/waist/shoulder targets projected from recent trends.
- **Multi-phase plans:** one continuous predicted curve across all phases.
- All predictions: actual data overlaid, ahead/behind status, updated ETA, forecast band.

### 5.7 Progress scoring per goal
Weekly check-in rates each phase against what matters for that goal, not just the scale:
- Cut: rate of loss, strength retention, waist change, adherence
- Bulk: rate of gain, strength gains, waist-to-weight ratio (fat gain check), adherence
- Recomp: waist, strength, body fat %, photo comparison, weight stability
- Maintenance: time inside band, strength stability

---

## 6. Feature modules & customization (anti-bloat)

### 6.1 Principles
- **Small core, everything else optional.**
- **Hiding is not deleting.** Data stays and returns when re-enabled; deleting module data is a separate confirmed action.
- **Permissions only when needed** (camera, microphone, location, Health Connect).
- **Off really means off:** no tabs, dashboard cards, notifications, settings or AI calls.
- **Simple vs Advanced mode** inside modules (e.g. RPE, tempo, skinfold sites appear only in Advanced).

### 6.2 Always-on core
Account & auth · profile · **goal & phase engine** · Today screen (container) · weight logging · settings · sync · data export · app lock

### 6.3 Module catalogue

| Group | Module | Requires | Permissions |
|---|---|---|---|
| **Nutrition** | Food logging (plain language, confirm table, targets, saved meals, recipes) | — | — |
| | ↳ Barcode & label scan | Food logging | Camera |
| | ↳ Meal photo AI | Food logging | Camera |
| | ↳ Voice food logging | Food logging | Microphone |
| | ↳ Micronutrients | Food logging | — |
| | ↳ Water & caffeine | — | — |
| | ↳ Fasting timer | — | — |
| | ↳ Alcohol | Food logging | — |
| | Meal planning & grocery list | Food logging | — |
| | Food budget (cost per protein) | Food logging | — |
| **Body** | Predictions & adaptive TDEE | Food logging | — |
| | Measurements | — | — |
| | Body composition (body fat %, lean mass, FFMI) | — | — |
| | Physique proportions (shoulder-to-waist, symmetry) | Measurements | — |
| | Progress photos | — | Camera |
| | Milestone cards | — | — |
| **Training** | Workouts (logger, library, routines, rest timer, PRs, 1RM) | — | — |
| | ↳ Programs & progression | Workouts | — |
| | ↳ Muscle volume & heatmap | Workouts | — |
| | ↳ Weak-point focus | Muscle volume | — |
| | ↳ Voice set logging | Workouts | Microphone |
| | ↳ Form check video | Workouts | Camera |
| | ↳ Rep counter (experimental) | Workouts | Camera |
| | Calisthenics skills | Workouts | — |
| **Cardio & activity** | Cardio & interval timers | — | — |
| | ↳ GPS tracking | Cardio | Location |
| | Activity (Health Connect) | — | Health Connect |
| **Recovery & lifestyle** | Recovery & readiness | Workouts | — |
| | Sleep & stress | — | — |
| | Wellbeing check-ins & journal | — | — |
| | ↳ Cycle tracking | Wellbeing | — |
| | Habits | — | — |
| | Supplements | — | — |
| **Health** | Health markers (blood pressure, resting HR, bloodwork) | — | — |
| **Coaching & learning** | AI coach | Food logging or Workouts | — |
| | Education hub | — | — |
| | Coach / trainer sharing | — | — |
| **Motivation** | Gamification (streaks, badges, PR wall) | — | — |
| | Sharing cards | — | — |
| | Gym check-in | Workouts | Location (optional) |

### 6.4 Onboarding presets (editable anytime)

| Preset | Goal set | Modules on |
|---|---|---|
| **Cut** | Cut | Food logging, Predictions, Measurements, Body comp, Photos, Milestones, Workouts, Habits |
| **Lean bulk** | Lean bulk | Food logging, Predictions, Workouts, Programs, Muscle volume, Measurements, Photos, Milestones |
| **Recomp** | Recomp | Food logging, Workouts, Programs, Measurements, Body comp, Photos, Milestones |
| **Maintenance** | Maintenance | Food logging (Simple), Workouts, Habits |
| **Strength / powerlifting** | Strength focus | Workouts, Programs, Recovery, Milestones, Gamification |
| **Bodybuilding** | Any | Everything in Body + Training groups, Weak-point focus, Proportions |
| **Calisthenics / home** | Any | Workouts, Calisthenics skills, Habits |
| **General fitness / cardio** | Maintenance or Cut | Cardio, GPS, Activity, Sleep, Habits |
| **Minimal** | Any | Food logging + weight, Simple mode everywhere |
| **Everything** | Any | All modules |

### 6.5 Customization surfaces
- **Settings → Features:** grouped toggles, descriptions, dependency hints, "Delete module data"
- **Dependency handling:** turning a module off warns which dependent modules will also hide; turning one on offers to enable its requirements
- **Bottom tabs:** built from enabled modules; the user picks up to 5 and their order, the rest under **More**
- **Today dashboard:** cards from enabled modules; drag to reorder, show/hide cards
- **Goal-aware defaults:** switching phase (e.g. cut → bulk) offers to swap dashboard cards and targets to suit the new goal
- **Notifications:** grouped by module, removed automatically when the module is off
- **Quick actions:** the "+" menu lists only enabled modules' actions

### 6.6 How it works (design only)
- **Feature registry** in code; each module declares `id`, name, description, `requires[]`, permissions, tabs, dashboard cards, settings panels, notification types, quick actions, preset defaults.
- `useFeature(id)` gate hook; routes for disabled modules redirect to Today.
- Enabled modules, tab order, dashboard layout and simple/advanced mode stored in `user_settings` (synced) and cached locally.
- Module screens lazy-loaded, so disabled modules cost nothing at startup.
- **Honest limit:** one APK still contains every module. Toggles remove clutter, permissions, background work and startup cost — not install size.

---

## 7. Auth & accounts

### Flow
1. **Welcome:** Continue with Google / email + password / magic link
2. **Guest mode (optional):** use locally; creating an account later uploads and links the data
3. **Onboarding:** body stats → experience → **physique goal builder** → recommended goal & phases → preset → predicted chart

### Features
- Google sign-in (redirect `metakai://auth-callback`), email + password with verification, magic link
- Forgot / reset password
- Session in expo-secure-store with automatic refresh; offline use after sign-in
- Biometric app lock, separate from account login
- Sign out, with an option to wipe local data
- **Account deletion** removing all server rows and photos (Play Store requirement)
- Full data export before deletion
- Account screen: profile, linked sign-in methods, sync status, storage used, export, delete

### Security
- **Row Level Security on every user table:** `user_id = auth.uid()`
- Private storage bucket `/{user_id}/...`, signed URLs
- Coach sharing uses revocable, scoped share tokens (read-only, selected data only, optional expiry)
- Edge Functions verify the JWT before calling AI
- Per-user AI rate limit (`ai_usage`)

---

## 8. Features

### 8.1 Nutrition

#### Plain-language food logging
**The AI parses the text; databases provide the numbers:**

```
"200g chicken breast, 1 katori dal, 2 rotis with ghee, 1 scoop whey"
        │
        ▼
 0. Parse cache hit?  → reuse the earlier parse (no AI call)
 1. AI parse          → [{food, quantity, unit, cooked/raw, prep}]
 2. Match food        → personal library → IFCT → USDA → Open Food Facts
 3. Convert units     → katori / cup / tbsp / piece → grams
 4. AI estimate       → only for unmatched items, labelled "estimated"
 5. Confirm table     → user edits amounts / swaps matches → save
```

- Plain-text, voice, meal photo, barcode and label-scan input
- **Follow-up questions:** "How much oil / ghee?", "Raw or cooked weight?"
- Editable results table; source badge per item (database / cache / AI estimate)
- Meal slots incl. pre/post workout
- Saved meals, recipes with servings, frequent/recent foods, copy yesterday, quick add
- Indian portion units (katori, roti, piece, glass) plus g / ml / oz; raw vs cooked
- Personal food library that learns corrections
- Restaurant / takeaway estimates

#### Dietary preferences (core setting)
- Vegetarian, eggetarian, vegan, Jain, pescatarian, halal, no beef / no pork
- Allergies and intolerances (lactose, gluten, nuts, soy)
- Used by food suggestions, meal plans, and the AI coach
- **Protein source guide** per diet type (e.g. vegetarian high-protein options with protein per 100 kcal)

#### Targets & dashboard
- Calories, protein, carbs, fat, fiber — rings/bars for what's left (targets from §5.5)
- Optional micronutrients, water, caffeine, alcohol, fasting timer
- **"What should I eat?"**: suggestions from usual foods to hit remaining macros
- Training-day vs rest-day targets; weekly budget; calorie cycling; refeeds
- **Protein distribution:** protein per meal, nudge to spread across 3–5 meals
- **Goal-specific helpers:**
  - Cut: high-volume low-calorie food ideas, hunger rating trend, "save calories for later" view
  - Bulk: **calorie-dense add-ons** (nuts, oils, milk, shakes), liquid calorie ideas, extra-meal reminders for low appetite
  - Recomp / maintenance: protein-first reminders, weekly average view instead of daily pass/fail
- Micronutrient gap flags (e.g. consistently low iron, calcium, vitamin D intake from logged foods)

#### Meal planning & grocery list
- **Weekly meal plan generator** from foods the user already eats, within macro targets and dietary preferences
- Built on local foods and recipes first; AI only for new ideas
- One-tap "log planned meal"
- **Grocery list** generated from the plan, grouped by category, checkable
- **Meal prep:** cook a batch, split into portions, log portions across days
- Swap a meal while keeping the day's macros

#### Food budget
- Enter food prices once (per kg / per pack)
- Cost per day, per week, and **cost per 100 g protein** comparison
- Cheapest ways to hit protein within dietary preferences

### 8.2 Body tracking

#### Weight
- Daily weigh-ins (manual or Health Connect smart scale)
- **Trend weight** (exponentially smoothed moving average)
- Chart: raw weigh-ins, trend, predicted curve for the active phase(s), goal line or maintenance band
- Ahead/behind status, updated ETA, plateau detection
- Day tags explaining spikes (high sodium, high carbs, poor sleep, period, creatine started)
- Weekly averages and week-over-week change

#### Measurements
- Neck, shoulders, chest, upper arms (L/R), forearms, waist, hips, thighs (L/R), calves (L/R)
- Measurement guide with illustrations for consistent tape placement
- Trends per site; goal-aware highlights (waist for cut/recomp, arms/chest/shoulders for bulk)

#### Body composition
- Methods (user picks, results labelled by method):
  - Visual estimate guide (reference images by body fat range)
  - US Navy tape method
  - **Skinfold calipers** (Jackson-Pollock 3-site and 7-site)
  - Smart scale (BIA) via Health Connect or manual
  - DEXA / Bod Pod result entry
- **Lean mass and fat mass** over time
- **FFMI** (and normalized FFMI) with context ranges
- **Waist-to-height ratio** as a simple health marker
- Bulk check: **waist-to-weight ratio** trend flags when weight gain is mostly fat

#### Physique proportions
- **Shoulder-to-waist ratio** (V-taper) with a target ratio
- Chest-to-waist, arm-to-waist, thigh-to-calf ratios
- **Left/right symmetry** for arms, thighs, calves
- "Most improved" and "lagging" body parts from measurements
- Feeds the **weak-point focus** in training (§8.3)

#### Progress photos
- Front / side / back sessions with **ghost overlay** for consistent framing
- Optional flexed and bodybuilding pose templates
- Same-lighting reminder and pose checklist
- Side-by-side and slider comparison; auto timelapse
- **Phase comparisons:** start vs end of each cut/bulk/recomp
- Private vault hidden from the gallery; full-size local, compressed sync
- Photo-day reminder (weekly or bi-weekly)

#### Milestone cards

```
┌─────────────────────────────┐
│  MILESTONE 3 · LEAN BULK     │
│  [photo]                     │
│  72.0 → 75.0 kg · 10 Mar     │
│  Arms +1.5 cm · Waist +0.5   │
│  Squat 100 → 120 kg          │
│  ─────────────────────────   │
│  NEXT: 77.0 kg · Squat 130   │
│  Predicted: 28 Apr           │
└─────────────────────────────┘
```

- Card types: **weight** (loss or gain), **body fat %**, **measurement** (waist, arms), **strength** (first 100 kg squat, bodyweight bench, 10 pull-ups), **skill** (first muscle-up), **phase complete**, **consistency** (100 workouts)
- Auto-generated from the active goal and phase plan, or custom
- Each card: before/after photo, key stats, days taken, **next target + ETA**
- Locked future cards show target and ETA; export as a shareable image

### 8.3 Training

#### Gym logger — fast logging
- Start an empty workout, a routine, or today's program day
- **Previous performance inline** on every set; numbers pre-filled from last session
- One-tap set completion
- Set types: warm-up, working, drop set, failure, AMRAP, back-off, rest-pause, myo-reps
- RPE / RIR per set and tempo (Advanced mode)
- Supersets, circuits, giant sets
- Per-exercise notes and **equipment settings** (seat height, pin position, grip)
- Replace an exercise mid-workout with an alternative for the same muscle
- **Voice set logging:** "bench 80 for 8 at 8" parsed on-device with a local grammar
- Workout-in-progress survives app close / phone restart
- **Ongoing notification** with current exercise and rest timer, usable from the lock screen
- **Gym mode:** large numbers and buttons for sweaty hands
- Finish screen: duration, volume, sets, PRs, muscles worked, notes, session rating

#### Timers & calculators
- **Rest timer** auto-starting after each set; per-exercise defaults; vibration + sound
- **Plate calculator** using the user's plates and bars (kg/lb)
- **Warm-up set generator** ramping to the working weight
- **1RM calculator** (Epley / Brzycki) and percentage tables
- Dumbbell / machine increment settings so suggestions use real weights
- Bodyweight exercises with added / assisted weight

#### Exercise library
- ~800 bundled exercises with images, instructions, primary/secondary muscles, equipment, movement pattern
- Custom exercises
- Filter by muscle, equipment, pattern, difficulty
- **Gym profiles:** home / commercial / hotel gym equipment lists; library and swaps respect them
- **Exercise alternatives** for the same muscle and pattern (for crowded gyms, equipment, injuries)
- Per-exercise history: best set, estimated 1RM, volume, reps at a given weight

#### Records & strength progress
- Automatic PRs: heaviest weight, best estimated 1RM, most reps at a weight, best set volume, best session volume
- PR wall; PR notification at the end of the set
- **Strength-to-bodyweight ratios** (key for cuts)
- DOTS / Wilks / IPF GL for powerlifting totals
- **Strength standards** by bodyweight and sex (beginner → elite), computed from published formula-based tables
- **Strength retention indicator on a cut** and **strength gain rate on a bulk**
- **Strength goals** with ETA from the estimated 1RM trend

#### Programs & progression
- **Routines:** saved templates
- **Weekly split planner:** assign routines to weekdays; planned vs done calendar
- **Built-in programs** (local templates), tagged by goal and experience:
  - Hypertrophy: PPL, Upper/Lower, Arnold split, Full Body 3×, bro split
  - Strength: beginner linear progression, GZCLP, 5/3/1-style, Texas-method-style
  - Powerbuilding hybrids
  - Home / dumbbell-only / bodyweight programs
- **Auto-progression rules:** linear, double progression, RPE-based, percentage-based
- Failure handling: repeat weight, deload after X failed sessions
- **Deload weeks:** scheduled or suggested from fatigue signals
- Training blocks / mesocycles
- **Goal-aware programming:**
  - Cut: keep intensity, optionally reduce volume
  - Bulk: gradual volume increases across the block
  - Recomp: moderate volume, strong progressive overload focus
  - Strength focus: peaking block + test week for 1RMs
- **AI program builder** (AI coach module): goal, days/week, session length, equipment, weak points, injuries → editable program

#### Muscle volume, heatmap & weak-point focus
- **Weekly sets per muscle** (primary = 1, secondary = 0.5)
- Target ranges per muscle by goal and experience; under / in range / over
- **SVG body diagram** coloured by weekly volume (front and back)
- Balance checks: push vs pull, quads vs hamstrings, left/right
- **Weak-point focus:** mark lagging muscles (from proportions or by choice) → program adds sets and moves those exercises earlier in the session
- Volume trend per muscle across weeks

#### Calisthenics skills
- **Skill trees** with progression steps and unlock criteria, e.g.:
  - Push-up → diamond → archer → one-arm push-up
  - Dead hang → negatives → pull-up → weighted pull-up → muscle-up
  - Tuck → advanced tuck → straddle → full front lever / planche
  - Wall handstand → freestanding handstand → handstand push-up
  - Pistol squat, L-sit, dragon flag, human flag
- Hold-time and rep tracking per step
- Skill milestone cards

#### Form check & rep counter
- **Form video** recorded from the logger, linked to the set; stored on-device only
- Side-by-side playback of two dates, slow motion, frame stepping
- **Rep counter (experimental):** ML Kit pose detection for squats, push-ups, curls, presses
- Range-of-motion depth indicator
- Manual counts always win

### 8.4 Cardio & activity

#### Cardio & conditioning
- Manual log: type, duration, distance, average heart rate, incline, resistance
- Calories from MET values × bodyweight × duration
- **GPS tracking** (runs, walks, rides): route, distance, pace, splits, elevation; works with the screen off
- **Interval timers:** HIIT, Tabata, EMOM, AMRAP, custom work/rest with audio + haptic cues
- Heart-rate zones (from Health Connect when available)
- **Goal-aware cardio guidance:** cut (steps + low-intensity cardio), bulk (minimum cardio for heart health without eating into the surplus), recomp (moderate)
- Cardio calories added to targets: off by default, optional partial add-back

#### Activity (Health Connect)
- Import steps, heart rate, resting heart rate, HRV (when available), sleep, weight, body fat, workouts
- Write Metakai workouts back to Health Connect
- **Step goal** and daily steps; **NEAT trend** (steps often drop during a cut)
- Per-data-type permission toggles

### 8.5 Recovery & lifestyle

#### Recovery & readiness
- **Muscle recovery map** from time since training and volume
- Soreness logging per body part
- **Readiness score** (0–100) from sleep, soreness, energy, stress, resting heart rate / HRV
- Suggestion: train as planned / reduce volume / swap muscle group / rest
- Rest-day recommendations when readiness stays low

#### Sleep & stress
- Sleep duration and quality (manual or Health Connect), bedtime consistency
- Sleep target by goal (recovery matters more on cuts and heavy bulks)
- Daily stress rating; stress vs weight fluctuation and hunger insights
- Wind-down reminder

#### Wellbeing check-ins & journal
- Daily 1–5 ratings: hunger, energy, mood, motivation, training performance, digestion
- Day tags (high sodium, travel, illness, social event, stress)
- Free-text journal per day
- Cycle tracking sub-module (for weight fluctuation context and training notes)

#### Habits
- Daily habit checklist tied to the goal: protein target hit, steps, sleep ≥ 7 h, water, training done, creatine
- Custom habits
- Streaks and weekly completion %
- Habit score included in the weekly check-in

#### Supplements
- Checklist: creatine, whey, caffeine, vitamin D, fish oil, multivitamin, custom
- Reminders and streaks
- Supplement entries with calories (e.g. whey, mass gainer) count toward macros
- Short evidence notes per common supplement (education hub)

### 8.6 Health markers
- Blood pressure, resting heart rate, waist-to-height ratio
- **Bloodwork log:** lipids, fasting glucose / HbA1c, vitamin D, B12, iron / ferritin, thyroid, testosterone / other hormones — value, unit, reference range, date
- Trend charts per marker; reminders for periodic tests (user-set)
- Informational only; no diagnosis

### 8.7 Coaching & learning

#### AI coach & insights
- **Weekly check-in report:** intake vs target, adherence, trend change vs phase rate, adaptive TDEE, training volume, PRs, strength change, measurements, habits, sleep — scored by the goal's success criteria (§5.7)
- **Suggested adjustments:** calories, cardio, volume, deload, diet break, phase change
- Chat with context from enabled modules only
- Correlations (sleep ↔ hunger, calories ↔ performance, steps ↔ loss rate)
- AI program builder, meal plan builder, exercise swap suggestions
- **Token and privacy rule:** aggregates computed in SQL; only a compact summary is sent

#### Education hub (offline)
- Short bundled articles: energy balance, protein, cutting vs bulking vs recomp, progressive overload, volume, deloads, sleep, supplements, reading food labels, measuring body fat, taking consistent progress photos
- **Contextual tips:** a relevant article surfaces at the right moment (first plateau, first deload, starting a bulk)
- Exercise technique cues in the library
- Glossary (RPE, RIR, TDEE, FFMI, AMRAP…)

#### Coach / trainer sharing
- Share selected data with a real coach via a revocable read-only link
- **Weekly check-in form** (weight average, photos, adherence, notes) sent to the coach view
- Coach can leave comments on check-ins (Supabase row, still free)
- Export a check-in as a PDF/image for coaches who use other tools

### 8.8 Motivation & sharing
- **Gamification:** logging, protein, training and habit streaks; badges; PR wall; workouts completed; total volume milestones
- **Weekly and monthly summaries** (workouts, volume, PRs, weight/waist change)
- **Phase recap** at the end of each cut/bulk/recomp: before/after, stats, strength change
- **Sharing cards:** workout summary, PR, milestone, phase recap — exported as images
- **Gym check-in:** attendance calendar, weekly gym streak, optional geofence auto check-in
- **Accountability partner (later):** read-only view of selected stats for a friend

### 8.8.1 Rank passes & achievements (approved 2026-09-17)

Two toggleable features, plus an Achievements section that collects badges from the whole app.

**Physique pass** (feature `rank_physique`)
- Ranks each muscle group: chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core.
- Score = **strength** (best estimated 1RM on key lifts for the group, relative to bodyweight, adjusted for sex and age, weighted by how directly the lift trains the group) **+ consistency** (weeks the group was trained over the last 12 weeks). Volume is not scored.
- Tiers: Iron → Bronze → Silver → Gold → Platinum → Diamond → Champion, three divisions each.
- Overall physique rank with a balance factor (weak groups pull it down).
- For each group: percentile vs the average person of the same sex, age, weight and height (published norms, offline), multiple of an untrained person's strength, standing vs app users (cloud), and where you differ from your own average.

**Run pass** (feature `rank_run`)
- 1K, 5K, 10K, half and marathon from best efforts, **age-graded** (World Masters Athletics tables) so ages and sexes compare fairly, plus weekly consistency.
- Only **GPS-recorded** runs count for leaderboards; manual runs count for personal rank only.

**Leaderboards** (cloud, opt-in)
- Filters: overall, sex, age group, weight class, height band, country, friends (invite code).
- Shows your rank, percentile, the distribution and the top 100 by user-chosen display name (length and profanity checks, unique).
- Upload only derived data: display name, random id, sex, age group, weight class, height band, country, per-group scores and tiers, age-graded GPS best efforts. Never logs, routes, photos or exact body stats. Delete everything with one tap.
- Anti-cheat: minimum sessions per lift, plausibility limits on strength-to-bodyweight, jump detection, outlier hold, GPS-only runs, rate limits.

**Backend:** Cloudflare Workers + D1 free tier (100k requests/day, 5M rows read/day, 100k writes/day, no inactivity pausing). Scores upload at most daily when changed; an hourly cron precomputes percentile histograms per filter bucket. Sign-in reuses Google (server stores only a hash of the Google subject).

**Achievements**
- One section for every badge in the app: training, cardio/GPS, nutrition, body, habits, rank tiers and PRs.
- Each achievement is a card with an earned date and progress toward locked ones, and can be shared as an image.
- No seasons or reward tracks; badges are the reward.

**Phases:** (1) offline ranks + passes + achievements + share cards, (2) Cloudflare leaderboards with filters and anti-cheat, (3) friends via invite codes.

### 8.9 Quality of life
- Home screen widgets: remaining macros, next workout, weight trend, quick log
- Notifications per module (weigh-in, meals, protein nudge, workout day, rest timer, photo day, supplements, habits, phase transitions)
- Dark mode, kg/lb and cm/in units, 12/24h time
- Calendar view combining food adherence, workouts, weigh-ins and habits
- Global search across logs
- Travel mode: hotel gym profile, eating-out guidance, relaxed tracking
- Undo for accidental deletes

### 8.10 Data & privacy
- Export CSV / JSON (+ zip with photos)
- **Import:** Strong / Hevy workout CSV, MyFitnessPal nutrition CSV, weight CSV
- Backup via Supabase sync + optional Google Drive
- Biometric app lock
- "Estimates, not medical advice" disclaimer
- Option to hide calories / numbers for users who find tracking stressful

---

## 9. Safety & responsible defaults
- **Rate limits by goal:** warnings above ~1% body weight/week loss, and above experience-appropriate gain rates
- **Calorie floor** on cuts (never below BMR by default; hard minimum regardless of settings)
- **Fat intake floor** for hormonal health
- **Under-18 users:** no aggressive deficits, no bulk surpluses beyond moderate, simplified targets
- **Very low body fat targets** (e.g. men < 6–8%, women < 14–16%) flagged as hard to sustain, with an explanation
- **Disordered eating sensitivity:** option to hide numbers, no shaming language, check-ins framed around trends not single days
- **No water-cutting, dehydration or peak-week manipulation protocols**
- **No PED protocols or dosing**; FFMI feasibility notes stay neutral and informational
- **Health markers** are informational, with "see a professional" guidance
- Pregnancy / medical conditions: onboarding question that switches off deficits and aggressive goals, suggesting professional guidance

---

## 10. Data model (Postgres, mirrored in SQLite)

All user-owned tables include `id uuid`, `user_id`, `created_at`, `updated_at`, `deleted_at`, with RLS enabled.

```
── Core ─────────────────────────────────────────────────────────────
profiles          (id = auth.users.id, name, sex, birthdate, height_cm, units,
                   activity, experience_level, dietary_prefs text[], allergies text[],
                   health_flags text[])
user_settings     (enabled_modules text[], preset, tab_order text[],
                   dashboard_layout jsonb, advanced_mode jsonb, notification_prefs jsonb)

── Goals & phases ───────────────────────────────────────────────────
physique_goals    (target_weight_kg, target_bf_pct, target_lean_kg,
                   target_measurements jsonb, strength_goals jsonb, created_at, active)
phases            (goal_id, type: cut/lean_bulk/bulk/recomp/maintain/reverse/
                   diet_break/mini_cut/strength/event_prep,
                   order, start_date, end_date, start_kg, target_kg,
                   rate_pct_week, kcal_adjustment, macro_rules jsonb,
                   maintenance_band_kg, event_date, status, result_summary jsonb)
daily_targets     (date, phase_id, kcal, protein, carbs, fat, fiber,
                   day_type: train/rest, source: auto/adaptive/manual)
predictions       (phase_id, date, predicted_kg, low_kg, high_kg,
                   predicted_lean_kg, predicted_fat_kg)   ← regenerated cache

── Nutrition ────────────────────────────────────────────────────────
foods             (owner_id NULL = global, name, source, per_100g macros,
                   micros jsonb, barcode, diet_tags text[])
serving_units     (food_id, unit, grams)
food_parse_cache  (normalized_input_hash, parsed_json, hits)
recipes / recipe_items
log_entries       (eaten_at, meal_slot, food_id, grams, macros_snapshot,
                   raw_input, source, confidence)
meal_plans        (week_start, phase_id)
meal_plan_items   (meal_plan_id, date, meal_slot, recipe_id | food_id, grams, logged)
grocery_items     (meal_plan_id, name, qty, unit, category, checked)
food_prices       (food_id, price, per_grams, currency)

── Body ─────────────────────────────────────────────────────────────
weight_entries    (measured_at, kg, source)
trend_cache       (date, trend_kg, estimated_tdee)
measurements      (date, site, side: L/R/null, cm)
body_comp_entries (date, method: visual/navy/skinfold3/skinfold7/bia/dexa,
                   bf_pct, lean_kg, fat_kg, skinfolds jsonb)
photo_sessions    (date, phase_id, weight_snapshot, notes)
photos            (session_id, pose, local_uri, storage_path)
milestones        (phase_id, kind: weight/bf/measurement/strength/skill/phase/
                   consistency/custom, target jsonb, reached_at, photo_id)

── Training ─────────────────────────────────────────────────────────
exercises         (owner_id NULL = bundled, name, primary_muscles[], secondary_muscles[],
                   equipment[], pattern, difficulty, is_unilateral, is_bodyweight)
exercise_alternatives (exercise_id, alternative_id, reason)
gym_profiles      (name, equipment[], plates jsonb, bars jsonb, db_increments, location)
routines / routine_items (exercise_id, order, sets, rep_range, rest_s, superset_group)
programs          (name, template_id, goal_tags[], start_date, days_per_week,
                   progression_rule jsonb, weak_points text[])
program_days      (program_id, week, day, routine_id, is_deload)
workouts          (started_at, ended_at, routine_id, program_day_id, gym_profile_id,
                   rating, notes)
workout_exercises (workout_id, exercise_id, order, superset_group, notes)
sets              (workout_exercise_id, order, type, weight_kg, reps, rpe, rir,
                   tempo, duration_s, distance_m, completed_at)
personal_records  (exercise_id, kind: 1rm/weight/reps/volume, value, set_id, achieved_at)
exercise_settings (exercise_id, gym_profile_id, notes)
form_videos       (set_id, local_uri, duration_s)            ← never uploaded
skills            (bundled: tree, step, name, unlock_criteria jsonb)
skill_progress    (skill_id, best_reps, best_hold_s, unlocked_at)
soreness_logs     (date, body_part, level)

── Cardio & activity ────────────────────────────────────────────────
cardio_sessions   (type, started_at, duration_s, distance_m, avg_hr, kcal, route_polyline)
interval_presets  (name, work_s, rest_s, rounds)
activity_daily    (date, steps, resting_hr, hrv, sleep_h, source)

── Lifestyle & health ───────────────────────────────────────────────
daily_checkins    (date, hunger, energy, mood, motivation, stress, digestion,
                   sleep_h, sleep_quality, readiness, tags[], journal)
habits / habit_logs (habit_id, date, done)
supplements / supplement_logs
health_markers    (date, type, value, unit, ref_low, ref_high, notes)

── Coaching, motivation, sharing ────────────────────────────────────
weekly_checkins   (week_start, phase_id, summary jsonb, score, ai_report, notes)
coach_shares      (token_hash, scopes text[], expires_at, revoked_at)
coach_comments    (share_id, weekly_checkin_id, body)
gym_checkins      (checked_in_at, gym_profile_id, source: manual/geofence)
badges            (code, earned_at)
ai_usage          (date, calls)
```

- Log entries store a **macro snapshot**; editing a food later doesn't rewrite history.
- Predictions are a cache regenerated whenever phases or adaptive TDEE change.
- Bundled reference data (exercises, skills, articles, IFCT) ships as read-only local assets, not user rows.

---

## 11. Screens

Tabs are **dynamic** (§6.5). Available screens:

1. **Auth**: welcome, sign in / up, reset password
2. **Onboarding**: stats → experience → physique goal builder → recommended goal & phases → preset → predicted chart
3. **Today**: customizable, goal-aware cards (macros, next workout, weight trend, readiness, habits, steps…)
4. **Plan**: physique goal, phase timeline, targets, event countdown
5. **Food**: log / confirm, meal plan, grocery list, recipes, food budget
6. **Workout**: start / routines / programs → active workout → finish summary
7. **Exercise library** and exercise detail
8. **Programs**: split planner, program calendar, progression settings, weak points
9. **Skills**: calisthenics skill trees
10. **Body**: muscle volume heatmap, recovery map
11. **Cardio**: manual log, GPS tracker, interval timer
12. **Progress**: weight vs prediction, measurements, body composition, proportions, strength trends, health markers
13. **Journey**: milestone cards, photo timeline, compare tools, phase recaps
14. **Check-in & Coach**: weekly check-in, AI chat, coach sharing
15. **Learn**: education hub
16. **Habits & wellbeing**: habits, check-ins, journal, sleep, supplements
17. **Settings**: Features (modules), tabs & dashboard, dietary preferences, gym profiles, integrations, notifications, units, sync, export, lock
18. **Account**: profile, sign-in methods, storage, delete account

---

## 12. Repo layout

```
metakai/
├── app/
│   ├── app.json                    name: Metakai, package: com.tfthushaar.metakai
│   ├── src/app/                    routes (expo-router), grouped per module
│   ├── src/core/
│   │   ├── features/               registry.ts, useFeature.ts, presets.ts
│   │   ├── goals/                  goal types, recommender, phase planner,
│   │   │                           target calculator, prediction models
│   │   ├── auth/  sync/  db/  ui/
│   ├── src/modules/
│   │   ├── nutrition/  meal-planning/  food-budget/
│   │   ├── measurements/  body-comp/  proportions/  photos/  milestones/
│   │   ├── workouts/  programs/  muscle-volume/  skills/
│   │   ├── form-check/
│   │   ├── cardio/  activity/
│   │   ├── recovery/  sleep/  wellbeing/  habits/  supplements/
│   │   ├── health-markers/
│   │   ├── coach/  learn/  coach-sharing/
│   │   └── gamification/  sharing/  gym-checkin/
│   ├── src/lib/                    pure, unit-tested math: BMR/TDEE, trend,
│   │                               adaptive TDEE, predictions, 1RM, plates,
│   │                               warm-ups, progression, MET, DOTS/Wilks,
│   │                               Navy/skinfold BF, FFMI, ratios, readiness
│   └── assets/                     ifct.sqlite, exercises/, skills.json,
│                                   articles/, body.svg
├── supabase/
│   ├── migrations/                 schema + RLS
│   └── functions/                  parse-food, photo-meal, food-lookup, weekly-report,
│                                   coach, program-builder, meal-plan, coach-share,
│                                   delete-account
├── .github/workflows/              ci.yml, android-release.yml, keepalive.yml
├── docs/PLAN.md
├── .env.example
└── README.md
```

Each module folder owns its screens, components, queries, dashboard cards and registry entry. `src/lib` holds pure functions with unit tests, since targets and predictions must be correct.

---

## 13. Roadmap

| Phase | Scope |
|---|---|
| **v0.0 Setup** | Repo scaffold, Expo app, Supabase project, CI + APK release, keep-alive job, **feature registry skeleton**, `src/lib` math with unit tests |
| **v0.1 Auth + goal engine + nutrition MVP** | Sign-in, RLS, onboarding, **goal types (cut / lean bulk / recomp / maintenance)**, target calculator, predictions per goal, plain-language food logging, dietary preferences, macro dashboard, weigh-ins + trend, actual vs predicted, SQLite + sync, Settings → Features, presets |
| **v0.2 Gym core** | Exercise library, routines, active workout with previous performance, rest timer + ongoing notification, plate calculator, warm-ups, 1RM, PRs, finish summary, exercise history, gym profiles |
| **v0.3 Body & progress** | Measurements, body composition (Navy, skinfolds, manual BIA/DEXA), FFMI, progress photos, milestone cards (all types), habits, saved meals / recipes, reminders, app lock, dynamic tabs + dashboard layout |
| **v0.4 Smart planning** | **Physique goal builder + goal recommender + phase planner**, remaining goal types (bulk, reverse, diet break, mini cut, strength, event prep), adaptive TDEE, weekly check-in, programs + auto-progression, deloads, muscle volume heatmap, training/rest-day macros, strength standards & goals, barcode scan |
| **v0.5 Recovery, cardio & health** | Recovery map, readiness, sleep & stress, wellbeing + journal, supplements, cardio + interval timers, GPS, Health Connect, health markers, widgets |
| **v0.6 Advanced training & food** | Calisthenics skill trees, weak-point focus, physique proportions, voice set logging, form check video, meal planning + grocery list + meal prep, food budget, education hub |
| **v0.7 AI & sharing** | AI coach chat, AI program and meal-plan builders, meal photo AI, label OCR, voice food logging, coach sharing, share cards, phase recaps, Strong / Hevy / MFP import |
| **v0.8 Experimental** | Pose rep counter + range of motion, gym geofence check-in, accountability partner, gamification badges |
| **v0.9 Rank passes** | Physique and Run passes (offline ranks vs population norms), Achievements with shareable cards, customisable layouts, then Cloudflare leaderboards with filters |
| **v1.0** | AI coach notes on weekly check-ins, under-18 and pregnancy target limits, minimal UI pass, store readiness for Google Play and the App Store (Sign in with Apple for leaderboards, web data deletion, iOS config, store listing and policy answers). |

---

## 14. Deliberately out of scope
- **Public social feed / community:** needs moderation and adds bloat; replaced by private sharing, coach links and an accountability partner.
- **Water cuts, peak week, PED protocols:** unsafe to automate (§9).
- **Medical diagnosis** from health markers.
- **Injury & pain log, mobility routines:** dropped by owner decision to keep the app focused.
- **Paid features / subscriptions:** conflicts with the $0 goal; can be reconsidered later.
- **Wear OS app:** free but a separate build effort; revisit after v1.0 (Health Connect covers watch data meanwhile).

---

## 15. Open decisions
1. **Guest mode, or required sign-in from day one?**
2. **Personal app or public users?** Free AI quota is shared across all users.
3. **IFCT in the MVP?** Depends on its license.
4. **Exercise library source:** free-exercise-db vs wger (license and image quality).
5. **Onboarding depth:** full physique goal builder up front, or quick goal pick first with the builder later?
6. **Map background for GPS routes:** plain route vs MapLibre + a free tile source.
7. **Strength standards data:** formula-based tables only, or find an openly licensed dataset.
