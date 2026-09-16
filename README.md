# Metakai

Build the body you want. Metakai tracks food, weight and progress for cutting, bulking, recomposition and maintenance in one Android app. It is built on free tiers only.

- **Food logging in plain language:** "2 rotis, 1 katori dal, 150g paneer" becomes an itemised list with calories and macros. Matching runs offline against a built-in food database; AI (Gemini, with Groq as fallback) handles foods the database doesn't know.
- **Goal engine:** cut, lean bulk, bulk, recomp or maintain, with calorie and macro targets from Mifflin-St Jeor or Katch-McArdle and safety floors.
- **Predictions:** a week-by-week weight simulation with a forecast band, a smoothed trend weight, a goal date, and whether you are ahead of or behind plan.
- **Gym:** an 876-exercise library, workout logger with previous performance, warm-ups, PR detection and a rest timer, plus routines and a plate calculator.
- **Body & progress:** measurements, body fat (tape, calipers or manual), lean mass and FFMI, private progress photos with a before/after slider, and milestone cards with predicted dates.
- **Habits & reminders:** automatic and manual daily habits, scheduled reminders, app lock, and a customisable Today layout.
- **Modular:** switch features on and off, or start from a preset.
- **Offline-first:** local SQLite, with optional Supabase sync and sign-in (Google, email, magic link).
- **Themes:** light, dark and system modes, six accent colours, and true-black or graphite dark styles.

The full product plan is in [docs/PLAN.md](docs/PLAN.md).

## Repo layout

```
app/                 Expo (React Native) app
  src/app/           screens (expo-router)
  src/core/          database, sync, auth, feature registry, theme, goal hooks
  src/lib/           pure, unit-tested maths (energy, targets, trend, predictions)
  src/modules/food/  food database, offline parser, AI client
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
