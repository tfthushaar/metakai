import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { TrackKind } from '../../lib/geo';

/**
 * Where GPS fixes come from. The standard build uses expo-location and its task manager; the
 * free-software build replaces this whole file with location.foss.ts, which needs no Google Play services.
 */

/** One GPS reading. */
export interface Fix {
  lat: number;
  lon: number;
  alt: number | null;
  altAccuracy: number | null;
  accuracy: number | null;
  /** Epoch milliseconds. */
  t: number;
}

const GPS_TASK = 'metakai-gps-tracking';

const toFix = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude,
  altAccuracy: l.coords.altitudeAccuracy,
  accuracy: l.coords.accuracy,
  t: l.timestamp,
});

/**
 * Says who gets the fixes while recording, with the screen off too. Call once, when the module loads:
 * the system may start the app in the background to deliver them.
 */
export function onFixes(handler: (fixes: Fix[]) => void) {
  // The web build has no GPS recording (browsers stop location when the screen locks).
  if (Platform.OS === 'web') return;
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    handler(data.locations.map(toFix));
  });
}

export type LocationReadiness = 'ok' | 'denied' | 'services-off';

/** Checks location is switched on and, if needed, asks for permission to use it while the app is open. */
export async function ensureLocationPermission(): Promise<LocationReadiness> {
  if (!(await Location.hasServicesEnabledAsync())) return 'services-off';
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'ok';
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted ? 'ok' : 'denied';
}

/** Starts recording fixes in a foreground service, with a notification saying so. No-op if already going. */
export async function startTracking(kind: TrackKind) {
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false)) return;
  const label = kind === 'cycle' ? 'ride' : kind;
  await Location.startLocationUpdatesAsync(GPS_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 0,
    activityType: kind === 'cycle' ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `Recording your ${label}`,
      notificationBody: 'Open Metakai to see your stats.',
      notificationColor: '#FF453A',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK).catch(() => {});
  }
}

/** Watches position while the record screen is open, so the signal indicator is live before starting. */
export async function watchFixes(handler: (fix: Fix) => void): Promise<() => void> {
  const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 0 }, (loc) => handler(toFix(loc)));
  return () => sub.remove();
}
