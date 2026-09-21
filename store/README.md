# Releasing Metakai

How to publish Metakai on Google Play and the App Store, checked against both stores' requirements as of September 2026.

| | Google Play | App Store |
|---|---|---|
| Account cost | US$25 once | US$99 per year |
| Build | Local, free: `scripts/release-android.sh` | EAS Build in the cloud (free plan: 15 iOS builds a month), no Mac needed |
| SDK requirement | Target Android 16 (API 36) from 31 Aug 2026. Metakai targets 36. | Built with Xcode 26 / iOS 26 SDK since 28 Apr 2026. EAS uses the latest image. |
| Before public release | New personal accounts: closed test with 12+ testers opted in for 14 days in a row | TestFlight (optional), then App Review |

Related files:
- [listing.md](listing.md): store text
- [declarations.md](declarations.md): answers for every policy form
- [assets/](assets/): icon, feature graphic and screenshots. Regenerate with `python scripts/make_store_assets.py <folder of raw 1080×2400 captures>`. The screenshots come from the Android build with the status bar cropped; the iOS screens are identical, but you can swap in iPhone captures from TestFlight.

---

## One-time setup

### 1. Google Cloud (both platforms)

In the Google Cloud project that owns the web OAuth client (`510560795620-…`):

1. **APIs & Services → Credentials → Web client → Authorized JavaScript origins:** add `https://tfthushaar.github.io`. The [data deletion page](https://tfthushaar.github.io/metakai/delete-account.html) signs in with this client.
2. **Android client:** make sure there is an Android OAuth client for `com.tfthushaar.metakai` with **both** SHA-1 fingerprints:
   - your upload key: `keytool -list -v -keystore ~/.metakai-signing/metakai-release.jks`
   - Google's app signing key, shown in Play Console → **Test and release → App integrity** after the first upload.
3. **iOS client (for Google Drive backup on iPhone):** Create credentials → OAuth client ID → iOS, bundle ID `com.tfthushaar.metakai`. Put its client ID in `app/.env`:
   ```
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
4. **OAuth consent screen:** publish the app (Production). The `drive.appdata` scope is non-sensitive, so no scope verification is needed, though Google may check your app name and logo first.

### 2. Apple (iOS only)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/).
2. **Sign in with Apple key** (lets the server revoke Apple sign-in when someone deletes their leaderboard profile, which Apple requires):
   Certificates, Identifiers & Profiles → **Keys** → + → enable **Sign in with Apple** → Configure → primary App ID `com.tfthushaar.metakai` → download the `.p8` file (only once; keep it with your signing files, never in the repo). Note the **Key ID** and your **Team ID**. Then:
   ```bash
   cd cloud
   npx wrangler secret put APPLE_TEAM_ID
   npx wrangler secret put APPLE_KEY_ID
   npx wrangler secret put APPLE_PRIVATE_KEY   # paste the whole .p8 contents
   ```
   The App ID itself (with the Sign in with Apple capability) is created by EAS on the first build.

### 3. Expo (iOS builds)

```bash
npm install -g eas-cli
eas login
cd app
eas init          # links the project and adds its ID to app.json; commit that change
```

---

## Google Play

### Build

```bash
scripts/release-android.sh
```

This produces `dist/metakai-<version>.aab` (for Play) and `dist/metakai-<version>.apk` (for GitHub Releases), signed with your upload key. Bump `version` and `android.versionCode` in `app/app.json` before every upload.

### First release

1. [Play Console](https://play.google.com/console) → **Create app**: name *Metakai*, language English (United States), App, Free. Accept the declarations.
2. **Policy → App content:** complete every form using [declarations.md](declarations.md): privacy policy, app access, ads, content rating, target audience, data safety, health apps, foreground service, advertising ID, government and financial features.
3. **Grow users → Store presence → Main store listing:** copy from [listing.md](listing.md), then upload `assets/play-icon-512.png`, `assets/play-feature-graphic.png` and the phone screenshots. Set category *Health & Fitness* and your contact email.
4. **Test and release → Setup → App signing:** keep **Play App Signing** on. Your existing keystore becomes the upload key.
5. **Test and release → Testing → Closed testing:** create a track, add a Google Group or email list with at least 12 testers, upload the `.aab`, add release notes from [listing.md](listing.md) and roll out. Share the opt-in link with testers and ask them to install and use the app.
6. After 14 consecutive days with 12 or more testers opted in, go to **Dashboard → Apply for production** and answer the questions about your test.
7. When production access is granted: **Production → Create new release** → reuse the tested bundle → roll out.

Keep publishing the `.apk` to GitHub Releases for people who sideload.

---

## App Store

### Build and upload

```bash
cd app
eas build --platform ios --profile production
eas submit --platform ios --latest
```

The first build asks for your Apple ID and creates the certificates, provisioning profile and App ID for you. `eas submit` creates the App Store Connect record if needed and uploads the build. Bump `version` and `ios.buildNumber` in `app/app.json` before every build.

### First release

1. [App Store Connect](https://appstoreconnect.apple.com) → the Metakai app → **App Information:** subtitle, categories, age rating ([declarations.md](declarations.md)) and content rights: *Yes, it contains third-party content, and I have the rights* (exercise images from free-exercise-db under the Unlicense; food data from Open Food Facts under the Open Database License).
2. **App Privacy:** privacy policy URL and the data types from [declarations.md](declarations.md).
3. **Pricing and Availability:** Free, all regions.
4. **iOS app version 1.0:** promotional text, description, keywords and support URL from [listing.md](listing.md); 6.9" iPhone screenshots (1320 × 2868) from `assets/`; the build from TestFlight; App Review notes from [declarations.md](declarations.md); your contact details.
5. **TestFlight (optional):** install the build on your iPhone and check Sign in with Apple, Google Drive backup, GPS recording with the screen locked, and the camera.
6. **Add for Review → Submit.**

---

## F-Droid

F-Droid builds the app from source itself, checks the result against the signed `-foss.apk` on the GitHub release and publishes that APK, signed by us. What it reads lives in this repository: the free-software build (see [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#free-software-build-and-f-droid)), the listing in [fastlane/](../fastlane/metadata/android/en-US) and the build recipe [fdroid/com.tfthushaar.metakai.yml](../fdroid/com.tfthushaar.metakai.yml).

### First submission

1. **Google sign-in for the free build:** create the iOS-type OAuth client described in [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#free-software-build-and-f-droid), set `EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID` in `app/.env`, add the ID to `GOOGLE_CLIENT_ID` in `cloud/wrangler.toml` after a comma, and `npx wrangler deploy` from `cloud/`. Without it the free build still works, and Drive backup and the leaderboards say they aren't set up.
2. **Release and tag:** commit, push, and tag the release commit `v<version>` (`git tag v1.5.0 && git push origin v1.5.0`).
3. **Recipe:** in `fdroid/com.tfthushaar.metakai.yml`, set the build's `commit` to that commit's full hash.
4. **Merge request:** sign in at [gitlab.com](https://gitlab.com), fork [fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata), add the recipe to your fork as `metadata/com.tfthushaar.metakai.yml` on a new branch, and open a merge request to `fdroid/fdroiddata` with the title *New App: com.tfthushaar.metakai*, ticking the checklist in the merge request template. Its pipeline builds the app the way F-Droid will; `fdroid lint` and the build must pass.
5. **Review:** F-Droid's volunteers reply on the merge request, usually within days to a few weeks. After the merge, the first build shows up on f-droid.org after a few more days.

After that, F-Droid notices each new `v*` tag by itself.

---

## Every release

1. Bump `version`, `android.versionCode` and `ios.buildNumber` in `app/app.json`.
2. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, the release notes for F-Droid (500 characters or fewer).
3. `cd app && npm test && npx tsc --noEmit`
4. Android: `scripts/release-android.sh`, upload the `.aab` to Play, attach the `.apk` to a GitHub release. `scripts/release-foss.sh` builds the free-software `-foss.apk` to attach as well.
5. Tag the same commit the `-foss.apk` was built from (`scripts/release-foss.sh` builds HEAD), push the tag and attach the `-foss.apk` to the GitHub release; F-Droid builds it from there and publishes the APK only if it matches.
6. iOS: `eas build --platform ios --profile production` then `eas submit --platform ios --latest`.
7. If data collection changed, update the privacy policy, data safety form and App Privacy answers first.
