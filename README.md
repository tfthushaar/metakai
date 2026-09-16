# Metakai

Build the body you want. Metakai tracks food, weight and progress for cutting, bulking, recomposition and maintenance in one Android app. It is built on free tiers only.

- **Food logging in plain language:** "2 rotis, 1 katori dal, 150g paneer" becomes an itemised list with calories and macros. Matching runs offline against a built-in food database; AI (Gemini, with Groq as fallback) handles foods the database doesn't know.
- **Goal engine:** cut, lean bulk, bulk, recomp or maintain, with calorie and macro targets from Mifflin-St Jeor or Katch-McArdle and safety floors.
- **Predictions:** a week-by-week weight simulation with a forecast band, a smoothed trend weight, a goal date, and whether you are ahead of or behind plan.
- **Gym:** an 876-exercise library, workout logger with previous performance, warm-ups, PR detection and a rest timer, plus routines and a plate calculator.
- **Body & progress:** measurements, body fat (tape, calipers or manual), lean mass and FFMI, private progress photos with a before/after slider, and milestone cards with predicted dates.
- **Habits & reminders:** automatic and manual daily habits, scheduled reminders, app lock, and a customisable Today layout.
- **Smart planning:** ten goal types (including diet breaks, mini cuts, reverse diets and event prep), a physique planner that turns a target body into a phase timeline, adaptive maintenance calories, weekly check-ins, training-day carbs, double progression with deload hints, weekly muscle volume, strength standards and barcode scanning.
- **Modular:** switch features on and off, or start from a preset.
- **Offline-first:** local SQLite, with optional Supabase sync and sign-in (Google, email, magic link).
- **Themes:** light, dark and system modes, six accent colours, and true-black or graphite dark styles.

The full product plan is in [docs/PLAN.md](docs/PLAN.md).

## Install

Download the latest APK from [Releases](https://github.com/tfthushaar/metakai/releases) on an Android phone and allow installs from that source. Each release is signed with the same key, so updates install over the previous version and keep your data.

## Status and what's left

**Built and on-device tested (v0.1–v0.4):** everything listed above. The app works fully offline.

### Needs the repo owner (can't be done without your accounts)

- **Supabase project.** Sign-in (Google, email, magic link), cloud sync, AI meal parsing and account deletion are all coded but switched off until a project exists. Follow [Cloud setup](#cloud-setup-free): create the project, run the migrations, deploy the two functions, set `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`), and add the app URL and anon key.
- **Google sign-in.** Create an OAuth client in Google Cloud and enable the Google provider in Supabase.
- **GitHub Actions secrets.** The token used during development couldn't write repo secrets, so the `v*` tag workflow refuses to publish until these are added: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, plus `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` once Supabase exists. Until then, releases are built and signed locally.
- **Back up the signing keystore.** It is stored outside the repo on the development machine in `~/.metakai-signing/`. Losing it means installed copies can never be updated.

### Not built yet (roadmap)

- **v0.5 Cardio, recovery and health:** cardio log and interval timers (HIIT, EMOM, Tabata), GPS runs and walks, Health Connect (steps, heart rate, sleep), recovery map, readiness score and soreness, sleep and stress tracking, wellbeing check-ins and journal, supplements, health markers (blood pressure, bloodwork), injury and pain log, mobility routines, home screen widgets.
- **v0.6 Advanced training and food:** built-in programs (PPL, Upper/Lower, GZCLP, 5/3/1-style) with scheduled deload weeks, calisthenics skill trees, weak-point focus and physique proportions (shoulder-to-waist, symmetry), SVG body heatmap, voice set logging, form-check video, meal planning with grocery lists and meal prep, food budget, dietary-preference filtering and "what should I eat" suggestions, an offline education hub.
- **v0.7 AI and sharing:** AI coach chat, AI program and meal-plan builders, meal photo estimates, nutrition label OCR, voice food logging, coach and trainer sharing links, shareable cards and phase recaps, import from Strong, Hevy and MyFitnessPal.
- **v0.8 Experimental:** camera rep counter, gym geofence check-in, accountability partner, badges.
- **v1.0:** full data export and import, an editable multi-phase planner (future phases on a timeline), cloud backup of progress photos, guest-to-account merge polish, final safety review. Play Store ($25) and iOS ($99/year) releases are optional and paid.

### Known limitations

- The built-in food database covers about 150 common Indian and international foods. Unknown foods need AI (requires Supabase), a barcode scan, or quick add.
- Progress photos stay on the phone that took them and are not synced yet.
- Exercise demo images load from a CDN, so they need a connection the first time.
- Android bars use a solid background; true blur is iOS-only in this Expo SDK.

## Repo layout

```
app/                 Expo (React Native) app
  src/app/           screens (expo-router)
  src/core/          database, sync, auth, feature registry, theme, goal hooks
  src/lib/           pure, unit-tested maths (targets, predictions, strength, body comp, planning)
  src/modules/       food (database, parser, AI, barcode), workouts, body, habits
  src/ui/            design system components
  plugins/           Expo config plugins (release signing)
supabase/
  migrations/        Postgres schema and row-level security
  functions/         edge functions: parse-food, delete-account
scripts/             icon generator
.github/workflows/   CI, APK release, Supabase keep-alive
```

## Develop

```bash
cd app
npm install
npm test            # unit tests
npm run typecheck
npx expo run:android   # needs Android Studio / SDK
```

The app runs fully offline without any configuration. To enable accounts, sync and AI, follow the steps below.

## Cloud setup (free)

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey), and optionally one from [Groq](https://console.groq.com/keys). Then deploy the functions:
   ```bash
   npx supabase secrets set GEMINI_API_KEY=... GROQ_API_KEY=...
   npx supabase functions deploy parse-food
   npx supabase functions deploy delete-account
   ```
4. Auth → URL configuration: add `metakai://auth-callback` to the redirect URLs.
5. Optional Google sign-in: create an OAuth client in Google Cloud, then enable the Google provider in Supabase Auth.
6. Copy `app/.env.example` to `app/.env.local` and fill in the project URL and anon key.
7. For release builds, add the same two values as GitHub secrets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Releases

Pushing a tag such as `v0.1.0` builds a signed APK and attaches it to a GitHub Release. The signing key is read from these repo secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keep an offline backup of the keystore. Without it, installed copies can't be updated.

Nutrition values are estimates, not medical advice.
