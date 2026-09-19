// Android setup for watches: Health Connect permissions, the privacy policy screen Health Connect
// links to from its permission pages, and Bluetooth as an optional feature.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const PRIVACY_URL = 'https://tfthushaar.github.io/metakai/privacy.html';

const HEALTH_PERMISSIONS = [
  'READ_STEPS',
  'READ_RESTING_HEART_RATE',
  'READ_HEART_RATE_VARIABILITY',
  'READ_HEART_RATE',
  'READ_SLEEP',
  'READ_WEIGHT',
  'READ_BODY_FAT',
  'READ_EXERCISE',
  'READ_DISTANCE',
  'READ_ACTIVE_CALORIES_BURNED',
  'READ_VO2_MAX',
  'READ_OXYGEN_SATURATION',
  'READ_RESPIRATORY_RATE',
  'WRITE_WEIGHT',
  'WRITE_EXERCISE',
  'WRITE_DISTANCE',
  'WRITE_ACTIVE_CALORIES_BURNED',
].map((p) => `android.permission.health.${p}`);

const ACTIVITY = 'HealthPrivacyActivity';

const activitySource = (pkg) => `package ${pkg}

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Health Connect opens this when someone asks how Metakai uses their health data. */
class ${ACTIVITY} : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${PRIVACY_URL}")))
    } catch (_: Exception) {
    }
    finish()
  }
}
`;

function addPermission(manifest, name) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  if (!manifest['uses-permission'].some((p) => p.$['android:name'] === name)) {
    manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
}

const withWatchManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Bluetooth permissions come from react-native-ble-plx's own manifest; Bluetooth stays optional
    // so phones without it can still install the app.
    HEALTH_PERMISSIONS.forEach((p) => addPermission(manifest, p));
    manifest['uses-feature'] = manifest['uses-feature'] || [];
    for (const name of ['android.hardware.bluetooth', 'android.hardware.bluetooth_le']) {
      if (!manifest['uses-feature'].some((f) => f.$['android:name'] === name)) {
        manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$['android:name'] === `.${ACTIVITY}`)) {
      app.activity.push({
        $: { 'android:name': `.${ACTIVITY}`, 'android:exported': 'true', 'android:theme': '@android:style/Theme.Translucent.NoTitleBar' },
        // Android 13 and below.
        'intent-filter': [{ action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }] }],
      });
    }
    app['activity-alias'] = app['activity-alias'] || [];
    if (!app['activity-alias'].some((a) => a.$['android:name'] === 'ViewPermissionUsageActivity')) {
      // Android 14 and up.
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': `.${ACTIVITY}`,
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }
    return cfg;
  });

const withPrivacyActivity = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkg = cfg.android?.package;
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ACTIVITY}.kt`), activitySource(pkg));
      return cfg;
    },
  ]);

module.exports = function withWatches(config) {
  return withPrivacyActivity(withWatchManifest(config));
};
