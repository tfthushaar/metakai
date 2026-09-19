import { Linking } from 'react-native';
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  RecordingMethod,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  type HealthConnectRecord,
  type Permission,
  type ReadRecordsOptions,
  type RecordResult,
  type RecordType,
} from 'react-native-health-connect';

import { healthConnectTypeFor, watchSessionFor, type OriginSample, type SleepInterval, type SleepStage } from '../../lib/wearables';
import type { HealthSource, ImportedWorkout, WatchMetric } from './types';

const OWN_PACKAGE = 'com.tfthushaar.metakai';
const PLAY_LISTING = 'market://details?id=com.google.android.apps.healthdata';

/** Friendly names for the apps that usually write watch data into Health Connect. */
const ORIGINS: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.google.android.apps.fitbit': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.withings.wiscale2': 'Withings',
  'com.ouraring.oura': 'Oura',
  'fi.polar.polarflow': 'Polar Flow',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.huawei.health': 'Huawei Health',
  'com.coros.coromsapp': 'COROS',
  'com.suunto.android': 'Suunto',
  'com.strava': 'Strava',
  'com.oneplus.health.international': 'OHealth',
  'com.whoop.android': 'WHOOP',
  'com.ultrahuman.android': 'Ultrahuman',
  'com.amazfit.healthapp': 'Amazfit',
};

/** The app a record came from, by name when it's a known one. */
const originOf = (r: { metadata?: { dataOrigin?: string } }): string | null => {
  const pkg = r.metadata?.dataOrigin;
  return pkg ? (ORIGINS[pkg] ?? pkg) : null;
};

const READ: RecordType[] = [
  'Steps',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'HeartRate',
  'SleepSession',
  'Weight',
  'BodyFat',
  'ExerciseSession',
  'Distance',
  'ActiveCaloriesBurned',
  'Vo2Max',
  'OxygenSaturation',
  'RespiratoryRate',
];
const WRITE: RecordType[] = ['Weight', 'ExerciseSession', 'ActiveCaloriesBurned', 'Distance'];

const between = (from: Date, to: Date) => ({ operator: 'between' as const, startTime: from.toISOString(), endTime: to.toISOString() });

async function readAll<T extends RecordType>(type: T, from: Date, to: Date): Promise<RecordResult<T>[]> {
  const out: RecordResult<T>[] = [];
  let pageToken: string | undefined;
  do {
    const options: ReadRecordsOptions = { timeRangeFilter: between(from, to), pageSize: 1000, ...(pageToken ? { pageToken } : {}) };
    const page = await readRecords(type, options);
    out.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return out;
}

/** Missing permission for one type shouldn't stop the rest of a sync. */
async function orEmpty<T>(work: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await work();
  } catch {
    return empty;
  }
}

async function ready(): Promise<boolean> {
  return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && (await initialize());
}

const STAGES: Record<number, SleepStage> = {
  [SleepStageType.AWAKE]: 'awake',
  [SleepStageType.OUT_OF_BED]: 'awake',
  [SleepStageType.LIGHT]: 'light',
  [SleepStageType.DEEP]: 'deep',
  [SleepStageType.REM]: 'rem',
  // SLEEPING, UNKNOWN and anything newer count as plain sleep.
};

/** One value per record, with where it came from. */
async function samples(metric: WatchMetric, from: Date, to: Date): Promise<OriginSample[]> {
  const at = (r: { time: string }) => Date.parse(r.time);
  switch (metric) {
    case 'rhr':
      return (await readAll('RestingHeartRate', from, to)).map((r) => ({ at: at(r), value: r.beatsPerMinute, origin: originOf(r) }));
    case 'hrv':
      return (await readAll('HeartRateVariabilityRmssd', from, to)).map((r) => ({ at: at(r), value: r.heartRateVariabilityMillis, origin: originOf(r) }));
    case 'vo2max':
      return (await readAll('Vo2Max', from, to)).map((r) => ({ at: at(r), value: r.vo2MillilitersPerMinuteKilogram, origin: originOf(r) }));
    case 'spo2':
      return (await readAll('OxygenSaturation', from, to)).map((r) => ({ at: at(r), value: r.percentage, origin: originOf(r) }));
    case 'resp':
      return (await readAll('RespiratoryRate', from, to)).map((r) => ({ at: at(r), value: r.rate, origin: originOf(r) }));
  }
}

export const healthConnect: HealthSource = {
  name: 'Health Connect',

  async status() {
    const s = await getSdkStatus();
    if (s === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (s === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_update';
    return 'needs_install';
  },

  async connect(share) {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      Linking.openURL(PLAY_LISTING).catch(() => {});
      return false;
    }
    if (!(await initialize())) return false;
    const wanted: Permission[] = [
      ...READ.map((recordType) => ({ accessType: 'read' as const, recordType })),
      ...(share ? WRITE.map((recordType) => ({ accessType: 'write' as const, recordType })) : []),
    ];
    const granted = await requestPermission(wanted);
    return granted.length > 0;
  },

  openSettings() {
    openHealthConnectSettings();
  },

  async steps(from, to) {
    if (!(await ready())) return {};
    return orEmpty(async () => {
      // Health Connect merges steps from several apps using the app priority set in its settings.
      const days = await aggregateGroupByPeriod({ recordType: 'Steps', timeRangeFilter: between(from, to), timeRangeSlicer: { period: 'DAYS', length: 1 } });
      // Period groups start at local midnight, e.g. 2026-09-19T00:00.
      return Object.fromEntries(days.filter((d) => d.result.COUNT_TOTAL > 0).map((d) => [d.startTime.slice(0, 10), d.result.COUNT_TOTAL]));
    }, {});
  },

  async activeCalories(from, to) {
    if (!(await ready())) return {};
    return orEmpty(async () => {
      const days = await aggregateGroupByPeriod({
        recordType: 'ActiveCaloriesBurned',
        timeRangeFilter: between(from, to),
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      return Object.fromEntries(
        days.filter((d) => d.result.ACTIVE_CALORIES_TOTAL?.inKilocalories > 0).map((d) => [d.startTime.slice(0, 10), Math.round(d.result.ACTIVE_CALORIES_TOTAL.inKilocalories)]),
      );
    }, {});
  },

  async readings(metric, from, to) {
    if (!(await ready())) return [];
    return orEmpty(() => samples(metric, from, to), []);
  },

  async sleep(from, to) {
    if (!(await ready())) return [];
    return orEmpty(async () => {
      const records = await readAll('SleepSession', from, to);
      return records
        .filter((r) => r.metadata?.dataOrigin !== OWN_PACKAGE)
        .map(
          (r): SleepInterval => ({
            start: Date.parse(r.startTime),
            end: Date.parse(r.endTime),
            origin: originOf(r),
            stages: r.stages?.map((st) => ({ start: Date.parse(st.startTime), end: Date.parse(st.endTime), stage: STAGES[st.stage] ?? 'asleep' })),
          }),
        );
    }, []);
  },

  async weights(from, to) {
    if (!(await ready())) return [];
    return orEmpty(async () => {
      const records = await readAll('Weight', from, to);
      return records
        .filter((r) => r.metadata?.dataOrigin !== OWN_PACKAGE && r.metadata?.id)
        .map((r) => ({ externalId: r.metadata!.id!, at: Date.parse(r.time), value: r.weight.inKilograms }));
    }, []);
  },

  async bodyFat(from, to) {
    if (!(await ready())) return [];
    return orEmpty(async () => {
      const records = await readAll('BodyFat', from, to);
      return records
        .filter((r) => r.metadata?.dataOrigin !== OWN_PACKAGE && r.metadata?.id)
        .map((r) => ({ externalId: r.metadata!.id!, at: Date.parse(r.time), value: r.percentage }));
    }, []);
  },

  async workouts(from, to) {
    if (!(await ready())) return [];
    const sessions = await orEmpty(() => readAll('ExerciseSession', from, to), []);
    const out: ImportedWorkout[] = [];
    for (const s of sessions) {
      const type = watchSessionFor('health_connect', s.exerciseType);
      if (!type || !s.metadata?.id || s.metadata.dataOrigin === OWN_PACKAGE) continue;
      const window = { operator: 'between' as const, startTime: s.startTime, endTime: s.endTime };
      const distance = type.strength ? null : await orEmpty(() => aggregateRecord({ recordType: 'Distance', timeRangeFilter: window }), null);
      const energy = await orEmpty(() => aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: window }), null);
      const heart = await orEmpty(() => aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: window }), null);
      const km = distance?.DISTANCE?.inKilometers ?? 0;
      const kcal = energy?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0;
      out.push({
        externalId: s.metadata.id,
        kind: type.kind,
        strength: type.strength,
        start: Date.parse(s.startTime),
        end: Date.parse(s.endTime),
        title: s.title?.trim() || type.label,
        distanceKm: km > 0.01 ? Math.round(km * 100) / 100 : null,
        kcal: kcal > 0 ? Math.round(kcal) : null,
        avgHr: heart?.BPM_AVG ? Math.round(heart.BPM_AVG) : null,
        maxHr: heart?.BPM_MAX ? Math.round(heart.BPM_MAX) : null,
        origin: originOf(s),
      });
    }
    return out;
  },

  async heartRate(start, end) {
    if (!(await ready())) return null;
    const heart = await orEmpty(() => aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: between(new Date(start), new Date(end)) }), null);
    return heart?.BPM_AVG ? { avg: Math.round(heart.BPM_AVG), max: Math.round(heart.BPM_MAX) } : null;
  },

  async shareWeight(id, kg, at) {
    if (!(await ready())) return;
    await insertRecords([
      {
        recordType: 'Weight',
        time: new Date(at).toISOString(),
        weight: { value: kg, unit: 'kilograms' },
        metadata: { clientRecordId: `weight-${id}`, clientRecordVersion: Date.now(), recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY },
      },
    ]);
  },

  async shareWorkout(w) {
    if (!(await ready())) return;
    const startTime = new Date(w.start).toISOString();
    const endTime = new Date(w.end).toISOString();
    const meta = (suffix: string) => ({
      clientRecordId: `${suffix}-${w.id}`,
      clientRecordVersion: Date.now(),
      recordingMethod: RecordingMethod.RECORDING_METHOD_ACTIVELY_RECORDED,
    });
    // Each insert takes records of a single type.
    const records: HealthConnectRecord[] = [
      { recordType: 'ExerciseSession', startTime, endTime, exerciseType: healthConnectTypeFor(w.kind), title: w.title, metadata: meta('session') },
    ];
    if (w.kcal) records.push({ recordType: 'ActiveCaloriesBurned', startTime, endTime, energy: { value: w.kcal, unit: 'kilocalories' }, metadata: meta('kcal') });
    if (w.distanceKm) records.push({ recordType: 'Distance', startTime, endTime, distance: { value: w.distanceKm, unit: 'kilometers' }, metadata: meta('distance') });
    for (const record of records) await insertRecords([record]);
  },
};
