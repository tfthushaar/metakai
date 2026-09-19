# Development

How Metakai is built, and how to build, sign and publish it yourself.

## Architecture

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/architecture-dark.svg">
    <img src="assets/architecture-light.svg" alt="Metakai architecture: screens, feature modules, pure logic and local storage all run on the phone. Leaderboards, Gemini and Groq, Open Food Facts and Google Drive are optional connections." width="100%">
  </picture>
</p>

- **Offline-first:** every screen reads from the local SQLite database through small repositories, and screens re-render when the tables they use change.
- **Feature registry:** each module declares its dependencies and permissions. Screens, tabs, Today cards and shortcuts check it before rendering, and a tab with nothing left to show leaves the tab bar.
- **Pure logic:** calculations live in `src/lib` as dependency-free, unit-tested functions, including energy and macros, predictions, 1RM and progression, body composition, GPS track maths, population strength norms and age grading, readiness, achievements and AI rate budgets.
- **Watches:** `src/modules/wearables` reads and writes Health Connect on Android (`react-native-health-connect`) and Apple Health on iOS (`@kingstinct/react-native-healthkit`) behind one interface, and pairs Bluetooth heart rate sensors with `react-native-ble-plx`. Imports are de-duplicated by the health platform's record ID, and records Metakai wrote itself are skipped. Parsing and mapping live in `src/lib/wearables.ts`.
- **Minimal backend:** the optional leaderboard is a small Cloudflare Worker with a D1 (SQLite) database in `cloud/`. It verifies Google or Apple sign-in, stores only derived scores, and precomputes score distributions every six hours to stay within the free tier. Every other network call goes directly from the phone to the service shown.

## Building from source

**Requirements:** Node.js 22+, Android Studio (SDK and an emulator or device), JDK 17. The app needs Android 8.0 (API 26) or newer, which Health Connect requires.

```bash
git clone https://github.com/tfthushaar/metakai.git
cd metakai/app
npm install
npm test              # unit tests
npm run typecheck     # TypeScript
npx expo run:android  # build and run a development build
```

### Android release builds

The signing config reads these environment variables:

| Variable | Purpose |
|---|---|
| `METAKAI_KEYSTORE` | Path to the release keystore |
| `METAKAI_KEYSTORE_PASSWORD` | Keystore password |
| `METAKAI_KEY_ALIAS` | Key alias |
| `METAKAI_KEY_PASSWORD` | Key password |

`scripts/release-android.sh` sets them from `~/.metakai-signing` and builds a Play Store bundle and an APK into `dist/`. Tagged pushes (`v*`) also build a signed APK through GitHub Actions when the matching `ANDROID_KEYSTORE_*` secrets are set.

### Health Connect and Apple Health

- `plugins/withWatches.js` adds the Health Connect permissions and a small activity that opens the privacy policy when Health Connect asks why the app wants access. Google Play requires the permissions to be declared in Play Console before release; the justification for each is in [store/declarations.md](../store/declarations.md).
- Health Connect is built into Android 14 and newer. On older phones the app sends users to the Health Connect app on Google Play.
- The HealthKit config plugin adds the HealthKit entitlement and the usage strings in `app.json`. Background delivery is off; the app syncs when it opens.

### iOS builds

iOS builds run on EAS Build, so no Mac is needed:

```bash
cd app
npx eas-cli build --platform ios --profile production
```

Publishing steps, store text and policy answers for Google Play and the App Store are in [store/](../store/README.md).

### Google sign-in

Needed for Drive backup, and for leaderboards on Android.

1. In Google Cloud, enable the Google Drive API.
2. Configure the OAuth consent screen with the `drive.appdata` scope.
3. Create a web OAuth client and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `app/.env`.
4. Create an Android OAuth client with package `com.tfthushaar.metakai` and your signing certificate's SHA-1.
5. For iOS, create an iOS OAuth client and set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `app/.env`.

### Leaderboard server

```bash
cd cloud
npm install
npx wrangler login
npx wrangler d1 create metakai-ranks     # put the database_id in wrangler.toml
npm run migrate
npx wrangler secret put ID_PEPPER        # any long random string
npx wrangler secret put SESSION_SECRET   # another long random string
npm run deploy
```

Then set `EXPO_PUBLIC_RANKS_API` in `app/.env` to the Worker URL. `GOOGLE_CLIENT_ID` in `wrangler.toml` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `app/.env` must be the same OAuth web client.

On iOS the leaderboards use Sign in with Apple. To revoke Apple sign-in when a profile is deleted, also set `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (a Sign in with Apple key).

To test locally, create `cloud/.dev.vars` with `ID_PEPPER` and `DEV_AUTH=1`, run `npm run dev`, and point `app/.env.local` at it with `EXPO_PUBLIC_RANKS_DEV_TOKEN=dev:you`.

## Project structure

```
app/
  src/app/        Screens and navigation (Expo Router)
  src/core/       Database, settings, layouts, theme, backup, Drive, app lock
  src/lib/        Pure, unit-tested calculations
  src/modules/    Feature modules: food, workouts, cardio, gps, ranks, achievements, recovery, health, body, habits, wearables
  src/ui/         Design system components
  plugins/        Expo config plugins (release signing, Health Connect)
docs/             Website (privacy policy, terms, data deletion), product plan and this guide
cloud/            Leaderboard API (Cloudflare Workers + D1)
store/            Store listing, policy answers and graphics for Google Play and the App Store
scripts/          Release build, icon, store graphic and exercise data generators
.github/          CI and release workflows
```

## Tech stack

| Area | Technology |
|---|---|
| App | React Native, Expo, Expo Router, TypeScript |
| UI | Reanimated, Gesture Handler, react-native-svg, Lucide icons, Inter |
| State and storage | Zustand, expo-sqlite (SQLite and key-value), expo-secure-store |
| Device | expo-location with task manager, expo-camera, expo-notifications, expo-local-authentication, react-native-view-shot, Health Connect, HealthKit, Bluetooth LE |
| Cloud (optional) | Google Sign-In and Drive REST API, Gemini and Groq APIs, Cloudflare Workers + D1 |
| Quality | Jest, TypeScript strict mode, GitHub Actions |
