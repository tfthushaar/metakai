# Policy forms and review answers

Answers for the Play Console **App content** forms and the App Store Connect questionnaires, based on what the app actually does in 1.0.0. If a feature changes, update these before the next release.

What leaves the phone, for reference:

| Data | Where it goes | When |
|---|---|---|
| Display name, country, sex, age group, weight class, height band, pass scores, GPS run times, friend links, a hashed Google or Apple account ID | Metakai leaderboard server (Cloudflare) | Only after joining leaderboards |
| All logs, settings and progress photos | The user's own Google Drive app folder | Only if Drive backup is connected |
| Meal text; for the coach, goal, sex, age, experience, weight, targets and weekly totals | Google Gemini or Groq, with the user's own key | Only when the user runs AI analysis or asks the coach |
| Barcode number | Open Food Facts | When scanning a product |
| Nothing (watch data stays on the phone) | Health Connect or Apple Health is read and written on the device itself | Only if the user connects Watches |

Nothing is used for advertising or tracking. There are no analytics SDKs.

---

## Google Play: App content

**Privacy policy:** https://tfthushaar.github.io/metakai/privacy.html

**App access:** All functionality is available without special access. (Leaderboards use any Google account; reviewers can join with their own.)

**Ads:** No, the app does not contain ads.

**Content rating (IARC):**
- Category: All other app types.
- Violence, sexuality, language, controlled substances, gambling: No.
- User interaction: users can see other users' chosen display names on leaderboards. No chat, no user-to-user messaging, no sharing of location.
- Shares location with other users: No.
- Digital purchases: No.

**Target audience:** 13–15, 16–17 and 18+. Not designed for children under 13. (Targets are automatically gentler for under-18s.)

**News app:** No. **Government app:** No. **Financial features:** None.

**Advertising ID:** No, the app does not use an advertising ID.

**Health apps declaration:** select
- Activity and Fitness
- Nutrition and Weight Management
- Sleep Management
- Stress Management, Relaxation, Mental Acuity

Metakai is not a medical device and makes no medical claims.

**Health Connect permissions:** declare these in Play Console → App content → Health Connect. For each, the use is shown to the user in You → Watches, and nothing read leaves the device.

| Permission | Justification |
|---|---|
| READ_STEPS | Shows the user's daily steps from their watch on the Today screen and in Health. |
| READ_RESTING_HEART_RATE | Compares resting heart rate with the user's own recent normal for their readiness score, and shows it in the watch overview. |
| READ_HEART_RATE_VARIABILITY | Compares HRV with the user's own recent normal for their readiness score, and shows it in the watch overview. |
| READ_HEART_RATE | Adds average and peak heart rate to workouts imported from the user's watch and to gym sessions and runs logged in Metakai while wearing it, for training load. |
| READ_SLEEP | Shows last night's sleep and its stages, and uses time asleep and deep and REM sleep in the readiness score. |
| READ_WEIGHT | Adds smart-scale weigh-ins to the user's weight trend, which drives their calorie targets and goal forecast. |
| READ_BODY_FAT | Adds smart-scale body fat readings to the user's body composition history. |
| READ_EXERCISE | Adds runs, rides, gym sessions, yoga and other workouts recorded on the user's watch to their activity log, or matches them to a workout they logged in Metakai so it isn't counted twice. |
| READ_DISTANCE | Adds distance to imported cardio sessions. |
| READ_ACTIVE_CALORIES_BURNED | Adds calories burned to imported sessions and shows the user's daily active calories in the watch overview. |
| READ_VO2_MAX | Shows the user's VO2 max (cardio fitness) from their watch in the watch overview and health markers. |
| READ_OXYGEN_SATURATION | Shows blood oxygen readings from the user's watch in the watch overview and health markers. |
| READ_RESPIRATORY_RATE | Shows breathing rate, usually measured overnight, in the watch overview and health markers. |
| WRITE_WEIGHT | When the user turns on "Send to Health Connect", saves weigh-ins they log in Metakai. |
| WRITE_EXERCISE | When the user turns on "Send to Health Connect", saves gym workouts and cardio they log in Metakai. |
| WRITE_DISTANCE | Saves the distance of runs and rides the user records in Metakai, with the session above. |
| WRITE_ACTIVE_CALORIES_BURNED | Saves estimated calories burned for workouts the user logs in Metakai, with the session above. |

The privacy policy has a "Watches and health apps" section with the Limited Use statement. Health Connect's permission screen opens it through the rationale activity.

**Foreground service permissions:** type `location`
- Use case: *Background Location Updates: User-initiated location sharing*.
- Description: "When the user taps Record to track a run, walk, hike or ride, Metakai keeps a location foreground service with an ongoing notification so the route, distance and pace keep recording while the screen is off. It stops when the user finishes or discards the activity. Location is only used while this recording is active, and the app never requests background location permission."
- Impact if deferred or interrupted: "The recording would miss part of the route, so distance, pace and splits for that activity would be wrong."
- Video: record a short screen capture: Train → Record → Start → lock the screen → unlock → Finish. Upload it to YouTube as unlisted and paste the link.

### Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all of the user data collected by your app encrypted in transit?** Yes.
**Do you provide a way for users to request that their data is deleted?** Yes.
**Delete account URL:** https://tfthushaar.github.io/metakai/delete-account.html

Declare these data types. For every one: **Collected** yes, **Shared** no (transfers happen at the user's request or go to the user's own account), **Processed ephemerally** no, **Required or optional** optional, **Purpose** App functionality.

| Category | Data type | Why |
|---|---|---|
| Personal info | Name | Leaderboard display name |
| Personal info | User IDs | Hashed Google account ID for leaderboards |
| Personal info | Other info | Sex, age group and country on leaderboards; sex and age for the AI coach |
| Health and fitness | Health info | Weight class and height band on leaderboards; weight and targets for the AI coach; body data in Drive backup |
| Health and fitness | Fitness info | Pass scores and run times on leaderboards; workouts in Drive backup; weekly totals for the AI coach |
| Photos and videos | Photos | Progress photos in the user's own Drive backup |
| App activity | Other user-generated content | Meal descriptions sent for AI analysis |

Watch data read from Health Connect is processed only on the device, so it is **not collected** in Data safety terms (it only leaves the phone inside the user's own Drive backup, like the rest of their logs).

Location: **not collected**. GPS routes stay on the phone (and in the user's own Drive backup if they turn it on; declare Precise location as well if you prefer to include backup contents).

---

## App Store Connect

**Primary category:** Health & Fitness. **Secondary:** Food & Drink.

**Age rating questionnaire:** answer None or No to every content question (violence, sexual content, profanity, drugs, gambling, horror). For the newer questions:
- Medical or treatment information: No.
- Health or wellness topics: Yes (fitness, nutrition and weight tracking).
- User-generated content or messaging: No messaging. Leaderboards show user-chosen display names; names are checked for length, allowed characters and blocked words.
- Unrestricted web access: No.
- Parental controls or age assurance: No.

**Export compliance:** handled in the build (`ITSAppUsesNonExemptEncryption` is false). The app only uses standard HTTPS.

### App Privacy

**Do you or your third-party partners collect data from this app?** Yes.
**Tracking:** No data is used for tracking.

Declare these, all **Linked to the user**, **not used for tracking**, purpose **App Functionality**:

| Category | Type | Why |
|---|---|---|
| Identifiers | User ID | Hashed Apple account ID for leaderboards |
| Health & Fitness | Health | Weight class and height band on leaderboards; weight for the AI coach |
| Health & Fitness | Fitness | Pass scores and run times on leaderboards; weekly totals for the AI coach |
| User Content | Other User Content | Leaderboard display name; meal descriptions for AI analysis |
| Other Data | Other Data Types | Sex, age group and country |

### App Review information

- **Sign-in required:** No. Every feature works without an account.
- **Notes:**

```
Metakai stores all data on the device and needs no account.

- Leaderboards (Progress > Leaderboards) are optional and use Sign in with Apple. Leaving them (profile icon > Leave leaderboards) deletes the profile from our server and revokes the Sign in with Apple token.
- GPS recording: Train > Record > Start. Location is used only while recording, with while-in-use permission.
- AI food analysis and the AI coach are optional and need the user's own free Gemini or Groq API key (You > AI). All other features work without it.
- Google Drive backup is optional (You > Backup & sync) and stores data in the user's own Drive app folder.
- Apple Health is optional (You > Watches > Connect Apple Health). Metakai reads steps, sleep, heart rate, weight, body fat and workouts to show them in the app, and, only if the user turns on "Send to Apple Health", writes the workouts and weigh-ins they log. Health data stays on the device and is never sent to our server or used for advertising.
- Live heart rate uses Bluetooth only to connect to a heart rate strap or watch the user pairs in You > Watches.
```

HealthKit data is not collected (it never leaves the device except in the user's own Google Drive backup), so App Privacy needs no new data types. The listing text mentions Apple Health, as App Review expects for HealthKit apps.
