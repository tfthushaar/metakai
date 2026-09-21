import { PermissionsAndroid, Platform } from 'react-native';

import type { TrackKind } from '../../lib/geo';
import Native, { type NativeFix } from '../../../foss-modules/metakai-location/src';
import type { Fix, LocationReadiness } from './location';

/**
 * GPS in the free-software build: Android's own location service through the metakai-location
 * module, with no Google Play services. Replaces location.ts.
 */

export type { Fix, LocationReadiness } from './location';

const toFix = (f: NativeFix): Fix => ({ lat: f.lat, lon: f.lon, alt: f.alt, altAccuracy: f.altAccuracy, accuracy: f.accuracy, t: f.t });

/**
 * Says who gets the fixes while recording. Fixes taken while the app was closed (the recording
 * service carries on without it) arrive first, then live ones. Call once, when the module loads.
 */
export function onFixes(handler: (fixes: Fix[]) => void) {
  if (Platform.OS !== 'android') return;
  Native.addListener('onFixes', (event) => handler(event.fixes.map(toFix)));
  Native.attach()
    .then((kept) => {
      if (kept.length) handler(kept.map(toFix));
    })
    .catch(() => {});
}

/** Checks location is switched on and, if needed, asks for permission to use it while the app is open. */
export async function ensureLocationPermission(): Promise<LocationReadiness> {
  if (!(await Native.servicesEnabled())) return 'services-off';
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  if (await PermissionsAndroid.check(fine)) return 'ok';
  const asked = await PermissionsAndroid.requestMultiple([fine, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
  // Choosing only "approximate" isn't enough to measure a run.
  return asked[fine] === PermissionsAndroid.RESULTS.GRANTED ? 'ok' : 'denied';
}

/**
 * Starts recording fixes in a foreground service, with a notification saying so. Also called when the
 * app opens mid-recording, which makes the service register for location afresh.
 */
export async function startTracking(kind: TrackKind) {
  const label = kind === 'cycle' ? 'ride' : kind;
  await Native.start(`Recording your ${label}`, 'Open Metakai to see your stats.');
}

export async function stopTracking() {
  await Native.stop().catch(() => {});
}

/** Watches position while the record screen is open, so the signal indicator is live before starting. */
export async function watchFixes(handler: (fix: Fix) => void): Promise<() => void> {
  const sub = Native.addListener('onWatch', (event) => handler(toFix(event.fix)));
  await Native.startWatch();
  return () => {
    sub.remove();
    Native.stopWatch().catch(() => {});
  };
}
