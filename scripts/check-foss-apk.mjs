#!/usr/bin/env node
// Checks that an APK really is the free-software build: no Google Play services, Firebase, ML Kit
// or other proprietary Google code inside. Exits 1 when it finds any.
//   node scripts/check-foss-apk.mjs dist/metakai-1.5.0-foss.apk
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** The files of a zip archive (an APK), by name. Only stored and deflated entries, which is all an APK has. */
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Not a zip file.');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('The zip directory is damaged.');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.set(name, () => (method === 0 ? buf.subarray(start, start + size) : inflateRawSync(buf.subarray(start, start + size))));
  }
  return files;
}

const CLASSES = {
  'Google Play services': /com\/google\/android\/gms\/[\w/$]+/g,
  Firebase: /com\/google\/firebase\/[\w/$]+/g,
  'ML Kit': /com\/google\/mlkit\/[\w/$]+/g,
  'Play Core and Play Integrity': /com\/google\/android\/play\/[\w/$]+/g,
  'Firebase data transport': /com\/google\/android\/datatransport[\w/$]*/g,
};
const LIBRARIES = /mlkit|firebase|gms|vision|barhopper|tflite/i;
const MANIFEST_WORDS = ['com.google.android.gms', 'com.google.firebase', 'com.google.android.c2dm', 'com.google.mlkit', 'com.google.android.finsky'];

const apk = process.argv[2];
if (!apk) {
  console.error('Usage: node scripts/check-foss-apk.mjs path/to/app.apk');
  process.exit(1);
}
const files = unzip(readFileSync(apk));
const problems = [];

for (const [name, read] of files) {
  if (!/^classes\d*\.dex$/.test(name)) continue;
  // Latin-1 keeps one character per byte, so the class names come through as they are stored.
  const text = read().toString('latin1');
  for (const [label, pattern] of Object.entries(CLASSES)) {
    const found = new Set(text.match(pattern));
    if (found.size) problems.push(`${label}: ${found.size} classes in ${name}, such as ${[...found].sort()[0]}`);
  }
}

const libraries = [...new Set([...files.keys()].filter((n) => n.startsWith('lib/') && n.endsWith('.so')).map((n) => n.split('/').pop()))];
for (const lib of libraries.filter((n) => LIBRARIES.test(n))) problems.push(`Native library ${lib}`);

// expo-image-picker declares a switched-off service with a Play services name, which only tells the Play
// Store that the photo picker could be installed. It holds no Google code, so it doesn't count.
const declared = /com\.google\.android\.gms\.metadata\.(ModuleDependencies|MODULE_DEPENDENCIES)/g;
const manifest = (files.get('AndroidManifest.xml')?.().toString('latin1').replace(/\0/g, '') ?? '').replace(declared, '');
for (const word of MANIFEST_WORDS) if (manifest.includes(word)) problems.push(`The manifest mentions ${word}`);

if (problems.length) {
  console.error(`${apk} is not free of proprietary code:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${apk}: no Google Play services, Firebase or ML Kit (${libraries.length} native libraries, ${[...files.keys()].filter((n) => /^classes\d*\.dex$/.test(n)).length} dex files checked).`);
