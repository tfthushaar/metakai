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
- **Several devices:** every sleep night and daily reading keeps the app it came from (`origin`). A night comes from one app (the user's choice, else the one with stages and the most sleep) and each day's reading from one app, so two devices never add up or blend. Watch workouts that overlap a gym session or run logged in Metakai are linked to it (`external_id`) instead of imported again, and aren't sent back to the health app.
- **Readiness:** `src/lib/recoveryScore.ts` combines sleep (with deep and REM share), HRV (log scale) and resting heart rate against a 30-day baseline from the same app, the check-in, and training load (TRIMP from heart rate, else sets or effort; 7 days against 28). With only a check-in it gives exactly the old `readiness()` score.
- **Reminders:** `src/lib/reminders.ts` describes each reminder (daily, weekly, on chosen weekdays, or repeating through the day, like water) and the notifications it turns into. `src/core/reminders.ts` clears and schedules them from settings, one change at a time, and leaves out those whose feature is switched off. Everything goes through `src/core/notify.ts`, so the standard and free-software builds each use their own scheduler.
- **Minimal backend:** the optional leaderboard is a small Cloudflare Worker with a D1 (SQLite) database in `cloud/`. It verifies Google or Apple sign-in, stores only derived scores, and precomputes score distributions every six hours to stay within the free tier. Every other network call goes directly from the phone to the service shown.
- **Two Android builds, one source tree:** the standard build (Play Store, GitHub) uses Google Play services, Firebase and ML Kit for sign-in, notifications, GPS and barcode scanning. The free-software build (F-Droid, and the `-foss` APK on GitHub) has none of them: `*.foss.ts(x)` files stand in for their standard twins, and three small native modules in `app/foss-modules` replace the native parts. Everything else is shared. See [Free-software build](#free-software-build-and-f-droid).

## Building from source

**Requirements:** Node.js 22+, Android Studio (SDK and an emulator or device), JDK 17. The app needs Android 8.0 (API 26) or newer, which Health Connect requires.

```bash
git clone https://github.com/tfthushaar/metakai.git
cd metakai/app
npm install
npm test              # unit tests, plus database tests that run every migration on sql.js
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

`scripts/release-android.sh` sets them from `~/.metakai-signing` and builds a Play Store bundle and an APK into `dist/`. `scripts/release-foss.sh` builds the free-software APK the same way (below). Tagged pushes (`v*`) also build a signed APK through GitHub Actions when the matching `ANDROID_KEYSTORE_*` secrets are set.

### Free-software build and F-Droid

F-Droid only accepts apps that are free software all the way down, and the standard build isn't: sign-in, notifications, GPS and the barcode scanner sit on Google Play services, Firebase and ML Kit. The free-software build has none of that and still does everything, including Google Drive backup and the leaderboards.

| | Standard build | Free-software build |
|---|---|---|
| Reminders and the rest timer | `expo-notifications` (Firebase) | `foss-modules/metakai-notify`: exact alarms from `AlarmManager`, kept across reboots |
| GPS recording | `expo-location` and `expo-task-manager` (Play services) | `foss-modules/metakai-location`: Android's `LocationManager` in a foreground service |
| Barcode scanning | `expo-camera` (ML Kit) | `foss-modules/metakai-scanner`: CameraX and ZXing |
| Google sign-in | `@react-native-google-signin/google-signin` | OAuth code flow with PKCE in a browser tab: `src/core/google.foss.ts`, `src/lib/oauth.ts`, `src/app/oauth2redirect.tsx` |

How the two builds are told apart:

- **`app/flavor.js`** decides. `METAKAI_FLAVOR=foss` or `standard` wins; without it, a tree that doesn't have the Google-backed packages installed (F-Droid removes them) is the free build. It also lists those packages.
- **Metro** (`app/metro.config.js`) puts `foss.ts` and `foss.tsx` ahead of the usual extensions in the free build, so `notify.foss.ts` replaces `notify.ts`, `location.foss.ts` replaces `location.ts`, and so on. The free files re-export the standard ones' types, so the rest of the app can't tell.
- **`app/app.config.js`** drops the Google-backed config plugins and adds the OAuth redirect to the manifest.
- **`scripts/flavor.mjs`** points `app/package.json` at `foss-modules` (Expo autolinking's `nativeModulesDir`) and keeps the Google-backed packages out of autolinking. `foss` and `standard` undo each other and are safe to repeat.

To try the free build on an emulator:

```bash
cd app
node ../scripts/flavor.mjs foss
METAKAI_FLAVOR=foss npx expo run:android
node ../scripts/flavor.mjs standard      # afterwards
```

To release it: commit, then `bash scripts/release-foss.sh`. It builds the APK with F-Droid's own recipe in F-Droid's own build server image (`scripts/fdroid-build.sh`), where `flavor.mjs foss --remove-packages --from-source` takes the Google-backed packages out of `package.json` and the lock file and compiles every Expo module from source. It then checks the result with `scripts/check-foss-apk.mjs`, which fails if any Google Play services, Firebase or ML Kit class, native library or manifest entry is left in the APK (run it on any APK you're unsure about), and signs it with the upload key into `dist/metakai-<version>-foss.apk`. F-Droid rebuilds the same commit and publishes this APK when the two match (below).

**Google sign-in without Play services.** The Android OAuth client type only works through Play services, so the free build signs in with the browser instead. That needs a client that allows a custom URL scheme: create an **iOS** OAuth client with bundle ID `com.tfthushaar.metakai` and set `EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID` to its ID in `app/.env` (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is the fallback). The browser returns to the app on `com.googleusercontent.apps.<client ID>:/oauth2redirect`, which `app.config.js` registers. There's no client secret, and the refresh token is kept in secure storage. Put the client ID after a comma in `GOOGLE_CLIENT_ID` in `cloud/wrangler.toml` and redeploy the Worker so it accepts the ID tokens. A leaderboard user ID comes from the Google account alone, so it's the same on both builds.

**Exact alarms.** The free build declares `USE_EXACT_ALARM` (and `SCHEDULE_EXACT_ALARM` up to Android 12) so the rest timer and reminders arrive on time. Google Play restricts that permission to alarm and calendar apps, which is why the standard build doesn't use it.

#### F-Droid

- **Listing:** `fastlane/metadata/android/en-US` holds `title.txt`, `short_description.txt` (80 characters or fewer, no full stop), `full_description.txt`, the icon, feature graphic and phone screenshots in `images/`, and a `changelogs/<versionCode>.txt` of 500 characters or fewer for every release. Copy new screenshots from `store/assets`.
- **Recipe:** `fdroid/com.tfthushaar.metakai.yml` is the file that goes into F-Droid's [fdroiddata](https://gitlab.com/fdroid/fdroiddata) repository as `metadata/com.tfthushaar.metakai.yml`. It checks out a commit, installs Node from Debian, removes the Google-backed packages, runs `expo prebuild` and builds an unsigned release APK. `UpdateCheckMode: Tags` with `AutoUpdateMode: Version` turns every new `v<version>` tag into an F-Droid version by itself, reading `version` and `android.versionCode` from `app/app.json`.
- **Testing the recipe:** `bash scripts/fdroid-build.sh` lints it and builds the commit you have checked out in F-Droid's own build server image, with the same scanner F-Droid uses. It needs Docker and about 8 GB of memory, and the first run takes an hour or more; `METAKAI_FDROID_ABIS=arm64-v8a` makes it quicker. Run it after changing dependencies, Expo or the way the app is built: F-Droid's scanner rejects prebuilt binaries and unknown Maven repositories, and the recipe's `scanignore` and `scandelete` lists are what let the build through.
- **Releasing:** raise `version` and `android.versionCode` in `app/app.json`, add `changelogs/<versionCode>.txt`, and commit. Then build the APK from that commit with `bash scripts/release-foss.sh`, tag the same commit `v<version>`, push the tag, and attach `dist/metakai-<version>-foss.apk` to the GitHub release next to the standard APK. Don't commit anything between building and tagging: F-Droid rebuilds the tagged commit and publishes our APK only if the two match.
- **Signing and reproducible builds:** the recipe has `Binaries` (the `-foss.apk` on the GitHub release) and `AllowedAPKSigningKeys` (the SHA-256 of our signing certificate). F-Droid rebuilds each release, copies our signature onto its unsigned build and publishes our APK only if every byte matches; a release whose APK doesn't match is skipped. So the GitHub, F-Droid and sideloaded free-software builds all carry one signature and can update each other. This was chosen before the first F-Droid release because it can't be switched on afterwards.
- **Anti-features:** `NonFreeNet` for Google Drive backup, Google sign-in for the leaderboards, and the optional Gemini or Groq key.
- **Data and assets** are all free: the exercise database ([free-exercise-db](https://github.com/yuhonas/free-exercise-db), Unlicense) and its images, USDA FoodData Central (public domain), the Compendium of Physical Activities MET values, Inter (SIL OFL) and Lucide icons (ISC).

### Health Connect and Apple Health

- `plugins/withWatches.js` adds the Health Connect permissions and a small activity that opens the privacy policy when Health Connect asks why the app wants access. Google Play requires the permissions to be declared in Play Console before release; the justification for each is in [store/declarations.md](../store/declarations.md).
- Health Connect is built into Android 14 and newer. On older phones the app sends users to the Health Connect app on Google Play.
- The HealthKit config plugin adds the HealthKit entitlement and the usage strings in `app.json`. Background delivery is off; the app syncs when it opens.
- To try sync on an emulator without a watch, install Google's Health Connect Toolbox and write test records (sleep with stages, HRV, resting heart rate, exercise sessions) under different apps.

### Home screen widgets (Android)

`react-native-android-widget` draws widgets from JavaScript, so they show the same data as the app without a separate native codebase.

- **Declared in `app.json`** through the library's config plugin: `Calories`, `Readiness` and `QuickLog`, each with a preview image in `app/assets/widgets`. `app/index.ts` is the app's entry point so `registerWidgets()` runs even when the widget wakes the app in the background.
- **Code lives in `src/widgets`:** `data.ts` reads from the database (`readBody()` is `useBody()` without React), `Widgets.tsx` draws them with the library's views, `render.tsx` picks light or dark colours from the app's theme, and `refresh.android.ts` redraws them shortly after anything they show changes. iOS and the web get empty stand-ins (`register.ts`, `refresh.ts`, `WidgetGallery.tsx`).
- **Quick log** mirrors the user's own choices from You → Layout. Actions open a `metakai://` link; the water action is handled in the background by the task handler.
- **Icons** are lucide paths in `src/widgets/icons.ts`, because widgets draw SVG rather than React components.
- **Adding to the home screen:** You → Widgets shows a live preview of each and asks the launcher to pin it.

### Web app

The same code builds a web app for iPhone (before the App Store release) and computers, served by GitHub Pages at <https://tfthushaar.github.io/metakai/app/>.

```bash
bash scripts/build-web.sh   # exports to docs/app and writes the service worker; commit and push to publish
```

- **Database:** browsers run SQLite through [sql.js](https://sql.js.org) (`app/public/sqljs`), loaded with a script tag so the bundler never sees it. The database lives in memory and is saved to IndexedDB after each write (`src/core/db/engine.web.ts`). Expo's own web SQLite needs cross-origin isolation headers that Safari and GitHub Pages don't support.
- **Platform files:** `*.web.ts` files replace their native twins on the web: the database engine, the key-value store, secure storage (localStorage) and Google sign-in.
- **Google sign-in** uses OAuth's browser redirect flow (`src/core/google.web.ts`), which needs `https://tfthushaar.github.io/metakai/app/` as an authorised redirect URI on the web OAuth client. The leaderboard server swaps the Google ID token for a Metakai session at `POST /v1/auth/google`.
- **Rulers:** react-native-web never reports drags from a scroll view and ignores snapping, so `RulerPicker.web.tsx` moves the strip itself from pointer events (mouse, touch and pen) with momentum, snapping, sideways trackpad scroll, the keyboard and slider semantics for screen readers. The maths is in `src/lib/ruler.ts`. The native ruler is untouched.
- **Phone-only features** (GPS, watches, progress photos) are marked `phoneOnly` in the feature registry and hidden on the web, along with anything that depends on them.
- **Offline and routing:** `scripts/web-sw.mjs` writes a service worker that caches the build. `docs/404.html` is a copy of the app, so reloading on any screen works on GitHub Pages.
- **Sub-path:** `experiments.baseUrl` is `/metakai/app`; files in `app/public` aren't rewritten, so their paths include it.

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
6. For the free-software Android build, which signs in through the browser, an iOS-type client works too; see [Free-software build](#free-software-build-and-f-droid).

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

Then set `EXPO_PUBLIC_RANKS_API` in `app/.env` to the Worker URL. `GOOGLE_CLIENT_ID` in `wrangler.toml` lists the OAuth clients the app asks Google ID tokens for: the web client that `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `app/.env` holds, then, after a comma, the client of the free-software Android build.

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
  foss-modules/   Native modules of the free-software build: notifications, GPS and the barcode scanner
docs/             Website (privacy policy, terms, data deletion), the built web app (docs/app), product plan and this guide
cloud/            Leaderboard API (Cloudflare Workers + D1)
store/            Store listing, policy answers and graphics for Google Play and the App Store
fastlane/         The F-Droid listing: text, screenshots and a changelog per release
fdroid/           The F-Droid build recipe, kept here and submitted to F-Droid's fdroiddata
scripts/          Android release and web builds, the free-software build and its checks, icon, store graphic and exercise data generators
.github/          CI and release workflows
```

## Tech stack

| Area | Technology |
|---|---|
| App | React Native, Expo, Expo Router, TypeScript |
| UI | Reanimated, Gesture Handler, react-native-svg, Lucide icons, Inter |
| State and storage | Zustand, expo-sqlite (SQLite and key-value), expo-secure-store |
| Device | expo-location with task manager, expo-camera, expo-notifications, expo-local-authentication, react-native-view-shot, Health Connect, HealthKit, Bluetooth LE; in the free build, its own notification, location and scanner modules (AlarmManager, LocationManager, CameraX and ZXing) |
| Cloud (optional) | Google Sign-In and Drive REST API, Gemini and Groq APIs, Cloudflare Workers + D1 |
| Quality | Jest, TypeScript strict mode, GitHub Actions |
