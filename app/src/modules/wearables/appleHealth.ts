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
import { appleTypeFor, cardioKindFor, dailyAverage, type SleepInterval } from '../../lib/wearables';
import type { HealthSource, ImportedWorkout } from './types';

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
  'HKWorkoutTypeIdentifier',
] as const;
const SHARE = ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier'] as const;

const range = (from: Date, to: Date) => ({ filter: { date: { startDate: from, endDate: to } } });

const ASLEEP: number[] = [
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
];

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
    return orEmpty(async () => {
      const midnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const days = await queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], midnight, { day: 1 }, { ...range(from, to), unit: 'count' });
      const out: Record<string, number> = {};
      for (const d of days) if (d.startDate && d.sumQuantity && d.sumQuantity.quantity > 0) out[dateKey(d.startDate)] = Math.round(d.sumQuantity.quantity);
      return out;
    }, {});
  },

  restingHeartRate(from, to) {
    return orEmpty(async () => {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { limit: 0, ...range(from, to), unit: 'count/min' });
      return dailyAverage(samples.map((s) => ({ at: s.startDate.getTime(), value: s.quantity })));
    }, {});
  },

  hrv(from, to) {
    return orEmpty(async () => {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { limit: 0, ...range(from, to), unit: 'ms' });
      return dailyAverage(samples.map((s) => ({ at: s.startDate.getTime(), value: s.quantity })));
    }, {});
  },

  sleep(from, to) {
    return orEmpty(async () => {
      const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, ...range(from, to) });
      return samples.map((s): SleepInterval => {
        const start = s.startDate.getTime();
        const end = s.endDate.getTime();
        return { start, end, stages: [{ start, end, asleep: ASLEEP.includes(s.value) }] };
      });
    }, []);
  },

  weights(from, to) {
    return orEmpty(async () => {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 0, ...range(from, to), unit: 'kg' });
      return samples
        .filter((s) => s.sourceRevision.source.bundleIdentifier !== OWN_BUNDLE)
        .map((s) => ({ externalId: s.uuid, at: s.startDate.getTime(), value: s.quantity }));
    }, []);
  },

  bodyFat(from, to) {
    return orEmpty(async () => {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', { limit: 0, ...range(from, to), unit: '%' });
      // Apple stores percentages as fractions (0.18 for 18%).
      return samples.map((s) => ({ externalId: s.uuid, at: s.startDate.getTime(), value: s.quantity <= 1 ? s.quantity * 100 : s.quantity }));
    }, []);
  },

  async workouts(from, to) {
    const workouts = await orEmpty(() => queryWorkoutSamples({ limit: 0, ...range(from, to) }), []);
    const out: ImportedWorkout[] = [];
    for (const w of workouts) {
      const kind = cardioKindFor('apple_health', w.workoutActivityType);
      const source = w.sourceRevision.source;
      if (kind && source.bundleIdentifier !== OWN_BUNDLE) {
        const heart = await orEmpty(
          () => queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage', 'discreteMax'], { ...range(w.startDate, w.endDate), unit: 'count/min' }),
          null,
        );
        out.push({
          externalId: w.uuid,
          kind,
          start: w.startDate.getTime(),
          end: w.endDate.getTime(),
          title: null,
          distanceKm: toKm(w.totalDistance),
          kcal: toKcal(w.totalEnergyBurned),
          avgHr: heart?.averageQuantity ? Math.round(heart.averageQuantity.quantity) : null,
          maxHr: heart?.maximumQuantity ? Math.round(heart.maximumQuantity.quantity) : null,
          origin: source.name || null,
        });
      }
      w.dispose();
    }
    return out;
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
