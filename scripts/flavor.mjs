#!/usr/bin/env node
// Points app/package.json at one of Metakai's two builds (see app/flavor.js).
//   node scripts/flavor.mjs foss       link the free replacements, skip the Google-backed packages
//   node scripts/flavor.mjs standard   undo that
// Both are safe to repeat. scripts/release-android.sh runs them around a build.
//
// For a throwaway copy of the tree (F-Droid's build, scripts/release-foss.sh), foss also takes:
//   --remove-packages   drop the Google-backed packages from package.json and package-lock.json too,
//                       so none of their code is downloaded or scanned. `standard` can't undo this.
//   --from-source       build every Expo module from source rather than from prebuilt binaries,
//                       which is all F-Droid accepts.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { PROPRIETARY } = createRequire(import.meta.url)('../app/flavor.js');
const appDir = new URL('../app/', import.meta.url);
const file = new URL('package.json', appDir);
const [mode, ...flags] = process.argv.slice(2);
const OPTIONS = ['--remove-packages', '--from-source'];
const usage = () => {
  console.error(`Usage: node scripts/flavor.mjs foss [${OPTIONS.join('] [')}]\n       node scripts/flavor.mjs standard`);
  process.exit(1);
};
if ((mode !== 'foss' && mode !== 'standard') || flags.some((f) => !OPTIONS.includes(f)) || (mode === 'standard' && flags.length)) usage();

if (flags.includes('--remove-packages')) {
  // Before package.json is read: npm rewrites it.
  const npm = ['remove', '--package-lock-only', '--no-audit', '--no-fund', ...PROPRIETARY];
  execFileSync('npm', npm, { cwd: fileURLToPath(appDir), stdio: 'inherit', shell: process.platform === 'win32' });
}

const pkg = JSON.parse(readFileSync(file, 'utf8'));
const expo = (pkg.expo ??= {});
const linking = (expo.autolinking ??= {});
const android = (linking.android ??= {});

if (mode === 'foss') {
  linking.nativeModulesDir = './foss-modules';
  android.exclude = [...new Set([...(android.exclude ?? []), ...PROPRIETARY])];
  if (flags.includes('--from-source')) android.buildFromSource = ['.*'];
} else {
  delete linking.nativeModulesDir;
  const rest = (android.exclude ?? []).filter((name) => !PROPRIETARY.includes(name));
  if (rest.length) android.exclude = rest;
  else delete android.exclude;
  delete android.buildFromSource;
}

// Leave no empty settings behind.
if (!Object.keys(android).length) delete linking.android;
if (!Object.keys(linking).length) delete expo.autolinking;
if (!Object.keys(expo).length) delete pkg.expo;

writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`app/package.json is set up for the ${mode} build.`);
