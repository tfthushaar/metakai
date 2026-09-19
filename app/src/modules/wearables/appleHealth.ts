import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  saveQuantitySample,
  saveWorkoutSample,
  type WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import { dateKey } from '../../lib/dates';
import { appleTypeFor, watchSessionFor, type OriginSample, type SleepInterval, type SleepStage } from '../../lib/wearables';
import type { HealthSource, ImportedWorkout, WatchMetric } from './types';

const OWN_BUNDLE = 'com.tfthushaar.metakai';

const READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKWorkoutTypeIdentifier',
] as const;
const SHARE = ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier'] as const;

const range = (from: Date, to: Date) => ({ filter: { date: { startDate: from, endDate: to } } });

const STAGES: Partial<Record<number, SleepStage>> = {
  [CategoryValueSleepAnalysis.asleepUnspecified]: 'asleep',
  [CategoryValueSleepAnalysis.awake]: 'awake',
  [CategoryValueSleepAnalysis.asleepCore]: 'light',
  [CategoryValueSleepAnalysis.asleepDeep]: 'deep',
  [CategoryValueSleepAnalysis.asleepREM]: 'rem',
  // In bed is skipped: it spans the whole night alongside the stages.
};

type Sourced = { sourceRevision?: { source?: { name?: string; bundleIdentifier?: string } } };
const originOf = (s: Sourced): string | null => s.sourceRevision?.source?.name || s.sourceRevision?.source?.bundleIdentifier || null;
const isOwn = (s: Sourced) => s.sourceRevision?.source?.bundleIdentifier === OWN_BUNDLE;

function toKm(q: { quantity: number; unit: string } | undefined): number | null {
  if (!q || q.quantity <= 0) return null;
  const km = q.unit === 'km' ? q.quantity : q.unit === 'mi' ? q.quantity * 1.609344 : q.quantity / 1000;
  return Math.round(km * 100) / 100;
}

function toKcal(q: { quantity: number; unit: string } | undefined): number | null {
  if (!q || q.quantity <= 0) return null;
  return Math.round(q.unit === 'kJ' ? q.quantity / 4.184 : q.quantity);
}

async function orEmpty<T>(work: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await work();
  } catch {
    return empty;
  }
}

async function samples(metric: WatchMetric, from: Date, to: Date): Promise<OriginSample[]> {
  const read = async (id: (typeof READ)[number], unit: string, scale = 1) => {
    const list = await queryQuantitySamples(id as 'HKQuantityTypeIdentifierHeartRate', { limit: 0, ...range(from, to), unit: unit as 'count/min' });
    return list.map((s) => ({ at: s.startDate.getTime(), value: s.quantity * scale, origin: originOf(s) }));
  };
  switch (metric) {
    case 'rhr':
      return read('HKQuantityTypeIdentifierRestingHeartRate', 'count/min');
    case 'hrv':
      return read('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms');
    case 'vo2max':
      return read('HKQuantityTypeIdentifierVO2Max', 'ml/(kg*min)');
    case 'spo2':
      // Apple stores percentages as fractions.
      return read('HKQuantityTypeIdentifierOxygenSaturation', '%', 100);
    case 'resp':
      return read('HKQuantityTypeIdentifierRespiratoryRate', 'count/min');
  }
}

async function dailySum(id: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'count' | 'kcal', from: Date, to: Date) {
  const midnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // Apple merges overlapping readings from several sources using the order set in the Health app.
  const days = await queryStatisticsCollectionForQuantity(id, ['cumulativeSum'], midnight, { day: 1 }, { ...range(from, to), unit: unit as never });
  const out: Record<string, number> = {};
  for (const d of days) if (d.startDate && d.sumQuantity && d.sumQuantity.quantity > 0) out[dateKey(d.startDate)] = Math.round(d.sumQuantity.quantity);
  return out;
}

export const appleHealth: HealthSource = {
  name: 'Apple Health',

  async status() {
    return (await isHealthDataAvailableAsync()) ? 'available' : 'unsupported';
  },

  async connect(share) {
    if (!(await isHealthDataAvailableAsync())) return false;
    // Apple never says which read types were allowed, only that the sheet was answered.
    return requestAuthorization({ toRead: READ, toShare: share ? SHARE : [] });
  },

  openSettings() {
    Linking.openURL('x-apple-health://').catch(() => {});
  },

  steps(from, to) {
    return orEmpty(() => dailySum('HKQuantityTypeIdentifierStepCount', 'count', from, to), {});
  },

  activeCalories(from, to) {
    return orEmpty(() => dailySum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', from, to), {});
  },

  readings(metric, from, to) {
    return orEmpty(() => samples(metric, from, to), []);
  },

  sleep(from, to) {
    return orEmpty(async () => {
      const list = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, ...range(from, to) });
      const out: SleepInterval[] = [];
      for (const s of list) {
        const stage = STAGES[s.value];
        if (!stage || isOwn(s)) continue;
        const start = s.startDate.getTime();
        const end = s.endDate.getTime();
        out.push({ start, end, origin: originOf(s), stages: [{ start, end, stage }] });
      }
      return out;
    }, []);
  },

  weights(from, to) {
    return orEmpty(async () => {
      const list = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 0, ...range(from, to), unit: 'kg' });
      return list.filter((s) => !isOwn(s)).map((s) => ({ externalId: s.uuid, at: s.startDate.getTime(), value: s.quantity }));
    }, []);
  },

  bodyFat(from, to) {
    return orEmpty(async () => {
      const list = await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', { limit: 0, ...range(from, to), unit: '%' });
      // Apple stores percentages as fractions (0.18 for 18%).
      return list.map((s) => ({ externalId: s.uuid, at: s.startDate.getTime(), value: s.quantity <= 1 ? s.quantity * 100 : s.quantity }));
    }, []);
  },

  async workouts(from, to) {
    const workouts = await orEmpty(() => queryWorkoutSamples({ limit: 0, ...range(from, to) }), []);
    const out: ImportedWorkout[] = [];
    for (const w of workouts) {
      const type = watchSessionFor('apple_health', w.workoutActivityType);
      if (type && !isOwn(w)) {
        const heart = await orEmpty(
          () => queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage', 'discreteMax'], { ...range(w.startDate, w.endDate), unit: 'count/min' }),
          null,
        );
        out.push({
          externalId: w.uuid,
          kind: type.kind,
          strength: type.strength,
          start: w.startDate.getTime(),
          end: w.endDate.getTime(),
          title: type.label,
          distanceKm: type.strength ? null : toKm(w.totalDistance),
          kcal: toKcal(w.totalEnergyBurned),
          avgHr: heart?.averageQuantity ? Math.round(heart.averageQuantity.quantity) : null,
          maxHr: heart?.maximumQuantity ? Math.round(heart.maximumQuantity.quantity) : null,
          origin: originOf(w),
        });
      }
      w.dispose();
    }
    return out;
  },

  async heartRate(start, end) {
    const heart = await orEmpty(
      () =>
        queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage', 'discreteMax'], {
          ...range(new Date(start), new Date(end)),
          unit: 'count/min',
        }),
      null,
    );
    return heart?.averageQuantity && heart.maximumQuantity ? { avg: Math.round(heart.averageQuantity.quantity), max: Math.round(heart.maximumQuantity.quantity) } : null;
  },

  async shareWeight(_id, kg, at) {
    const when = new Date(at);
    await saveQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg', kg, when, when);
  },

  async shareWorkout(w) {
    await saveWorkoutSample(appleTypeFor(w.kind) as WorkoutActivityType, [], new Date(w.start), new Date(w.end), {
      energyBurned: w.kcal ?? undefined,
      distance: w.distanceKm ? w.distanceKm * 1000 : undefined,
    });
  },
};
