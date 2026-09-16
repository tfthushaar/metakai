# Metakai

Build the body you want. Metakai tracks food, weight and progress for cutting, bulking, recomposition and maintenance in one Android app. It costs nothing to run: your data lives on your phone, backups go to your own Google Drive, and AI uses your own free keys.

- **Food logging in plain language:** "2 rotis, 1 katori dal, 150g paneer" becomes an itemised list with calories and macros. Matching runs offline against a built-in food database. For foods it doesn't know, AI uses your own free Gemini and/or Groq key, spreading requests across four models so you rarely hit a limit. Foods the AI finds are saved on the phone for next time.
- **Goal engine:** cut, lean bulk, bulk, recomp or maintain, with calorie and macro targets from Mifflin-St Jeor or Katch-McArdle and safety floors.
- **Predictions:** a week-by-week weight simulation with a forecast band, a smoothed trend weight, a goal date, and whether you are ahead of or behind plan.
- **Gym:** an 876-exercise library, workout logger with previous performance, warm-ups, PR detection and a rest timer, plus routines and a plate calculator.
- **Fast workout logging:** type what you did ("bench 3x8 60", "deadlift 100x5 120x3") and it's matched to exercises and saved in one tap. Every workout gets an estimated calorie burn.
- **Splits and progressive overload:** pick a preset split (Push/Pull/Legs, Upper/Lower, Full body, PHUL, Arnold, Bro split) or build your own, choose exercises for each muscle group, and see which lifts are progressing, holding or slipping. Weekly workouts, calories burned and lifts progressing also show on the Today screen.
- **Body & progress:** measurements, body fat (tape, calipers or manual), lean mass and FFMI, private progress photos with a before/after slider, and milestone cards with predicted dates.
- **Habits & reminders:** automatic and manual daily habits, scheduled reminders, app lock, and a customisable Today layout.
- **Smart planning:** ten goal types (including diet breaks, mini cuts, reverse diets and event prep), a physique planner that turns a target body into a phase timeline, adaptive maintenance calories, weekly check-ins, training-day carbs, double progression with deload hints, weekly muscle volume, strength standards and barcode scanning.
- **Modular:** switch features on and off, or start from a preset.
- **Your data, your phone:** everything is stored locally and works offline with no account. Optionally back up to a private app folder in your own Google Drive, which updates automatically and restores onto a new phone at sign-in. You can also export and import a backup file.
- **Themes:** light, dark and system modes, six accent colours, and true-black or graphite dark styles.

The full product plan is in [docs/PLAN.md](docs/PLAN.md).

## Install

Download the latest APK from [Releases](https://github.com/tfthushaar/metakai/releases) on an Android phone and allow installs from that source. Each release is signed with the same key, so updates install over the previous version and keep your data.

## Status and what's left

**Built and on-device tested (v0.1–v0.6):** everything listed above. The app works fully offline.

**Built, waiting on setup:** Google Drive backup and restore are coded and the sign-in screen opens, but Drive can't connect until the Google Cloud setup below is done. Backup files and your own AI keys work now.

### Needs the repo owner (can't be done without your accounts)

- **Google Cloud project for Drive backup** (free, one-time):
  1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and enable the **Google Drive API**.
  2. Set up the **OAuth consent screen** (Google Auth Platform → Branding/Audience): External, app name Metakai, your email. Add the scope `.../auth/drive.appdata`. It is non-sensitive, so no security review is needed. Then publish the app ("In production"). While it's in testing, only listed test users can sign in.
  3. Create two **OAuth client IDs** of type **Android**, both with package name `com.tfthushaar.metakai`:
     - release SHA-1 `79:97:27:D9:8C:F6:C2:47:BC:31:3B:15:6C:93:FC:1B:E9:B9:1A:97`
     - debug SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (for development builds)

  No keys go into the app: Google matches the package name and signing certificate. Until this is done, Drive buttons say backup isn't set up yet, and backup files still work.
- **GitHub Actions secrets.** The token used during development couldn't write repo secrets, so the `v*` tag workflow refuses to publish until these are added: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Until then, releases are built and signed locally.
- **Back up the signing keystore.** It is stored outside the repo on the development machine in `~/.metakai-signing/`. Losing it means installed copies can never be updated, and the Drive OAuth client would need a new SHA-1.
- **Optional: Supabase.** The older account-based sync (Supabase) is still in the code but no longer needed. It only appears if a project is configured (see [Supabase setup](#optional-supabase-setup)).

### Not built yet (roadmap)

- **v0.7 Cardio, recovery and health:** cardio log and interval timers (HIIT, EMOM, Tabata), GPS runs and walks, Health Connect (steps, heart rate, sleep), recovery map, readiness score and soreness, sleep and stress tracking, wellbeing check-ins and journal, supplements, health markers (blood pressure, bloodwork), injury and pain log, mobility routines, home screen widgets.
- **v0.8 Advanced training and food:** built-in programs with set percentages and scheduled deload weeks (GZCLP, 5/3/1-style), calisthenics skill trees, weak-point focus and physique proportions (shoulder-to-waist, symmetry), SVG body heatmap, voice set logging, form-check video, meal planning with grocery lists and meal prep, food budget, dietary-preference filtering and "what should I eat" suggestions, an offline education hub.
- **v0.9 AI and sharing:** AI coach chat, AI program and meal-plan builders, meal photo estimates, nutrition label OCR, voice food logging, coach and trainer sharing links, shareable cards and phase recaps, import from Strong, Hevy and MyFitnessPal.
- **v0.10 Experimental:** camera rep counter, gym geofence check-in, accountability partner, badges.
- **v1.0:** an editable multi-phase planner (future phases on a timeline), CSV export for spreadsheets, and a final safety review. Play Store ($25) and iOS ($99/year) releases are optional and paid.

### Known limitations

- The built-in food database covers about 150 common Indian and international foods. Unknown foods need an AI key, a barcode scan, or quick add.
- Free AI limits are set by Google and Groq and change over time. The app tracks usage per model, and adapts when a provider reports a limit.
- Drive sync merges whole records (the newest edit wins). If you edit the same entry on two phones before either syncs, the later edit is kept.
- Exercise demo images load from a CDN, so they need a connection the first time.
- Calories burned from lifting are estimates based on MET values, bodyweight, duration and set density. Treat them as a rough guide.
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

The app runs fully offline without any configuration. AI keys are entered in the app (Settings → AI). Drive backup needs the Google Cloud setup above.

## Optional: Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey), and optionally one from [Groq](https://console.groq.com/keys). Then deploy the functions (model lists can be overridden with `GEMINI_MODELS` and `GROQ_MODELS`):
   ```bash
   npx supabase secrets set GEMINI_API_KEY=... GROQ_API_KEY=...
   npx supabase functions deploy parse-food
   npx supabase functions deploy delete-account
   ```
4. Auth → URL configuration: add `metakai://auth-callback` to the redirect URLs.
5. Optional Google sign-in: create an OAuth client in Google Cloud, then enable the Google provider in Supabase Auth.
6. Copy `app/.env.example` to `app/.env.local` and fill in the project URL and anon key.
7. For release builds, add the same two values as GitHub secrets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

With Supabase configured, the welcome screen also offers account sign-in, and AI works for signed-in users without their own key (the `parse-food` function uses the same model fallback chain).

## Releases

Pushing a tag such as `v0.1.0` builds a signed APK and attaches it to a GitHub Release. The signing key is read from these repo secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keep an offline backup of the keystore. Without it, installed copies can't be updated.

Nutrition values are estimates, not medical advice.
