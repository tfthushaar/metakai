#!/usr/bin/env node
// Points app/package.json at one of Metakai's two builds (see app/flavor.js).
//   node scripts/flavor.mjs foss       link the free replacements, skip the Google-backed packages
//   node scripts/flavor.mjs standard   undo that
// Both are safe to repeat. F-Droid's recipe runs `foss`; scripts/release-android.sh runs it around the build.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PROPRIETARY } = createRequire(import.meta.url)('../app/flavor.js');
const file = new URL('../app/package.json', import.meta.url);
const mode = process.argv[2];
if (mode !== 'foss' && mode !== 'standard') {
  console.error('Usage: node scripts/flavor.mjs foss|standard');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(file, 'utf8'));
const expo = (pkg.expo ??= {});
const linking = (expo.autolinking ??= {});
const android = (linking.android ??= {});

if (mode === 'foss') {
  linking.nativeModulesDir = './foss-modules';
  android.exclude = [...new Set([...(android.exclude ?? []), ...PROPRIETARY])];
} else {
  delete linking.nativeModulesDir;
  const rest = (android.exclude ?? []).filter((name) => !PROPRIETARY.includes(name));
  if (rest.length) android.exclude = rest;
  else delete android.exclude;
}

// Leave no empty settings behind.
if (!Object.keys(android).length) delete linking.android;
if (!Object.keys(linking).length) delete expo.autolinking;
if (!Object.keys(expo).length) delete pkg.expo;

writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`app/package.json is set up for the ${mode} build.`);
