import type { CardioKind } from '../../lib/cardio';
import type { SleepInterval } from '../../lib/wearables';

export type HealthStatus = 'available' | 'needs_install' | 'needs_update' | 'unsupported';

export interface ImportedWorkout {
  externalId: string;
  kind: CardioKind;
  start: number;
  end: number;
  title: string | null;
  distanceKm: number | null;
  kcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** App that recorded it, like Samsung Health or Garmin Connect. */
  origin: string | null;
}

export interface ImportedReading {
  externalId: string;
  at: number;
  value: number;
}

export interface SharedWorkout {
  id: string;
  kind: CardioKind | 'strength';
  start: number;
  end: number;
  title: string;
  kcal: number | null;
  distanceKm: number | null;
}

/** One health platform: Health Connect on Android or Apple Health on iOS. */
export interface HealthSource {
  name: 'Health Connect' | 'Apple Health';
  status(): Promise<HealthStatus>;
  /** Asks for access; true when at least one type was granted. */
  connect(share: boolean): Promise<boolean>;
  /** Where the user manages what Metakai can read and write. */
  openSettings(): void;
  steps(from: Date, to: Date): Promise<Record<string, number>>;
  restingHeartRate(from: Date, to: Date): Promise<Record<string, number>>;
  hrv(from: Date, to: Date): Promise<Record<string, number>>;
  sleep(from: Date, to: Date): Promise<SleepInterval[]>;
  weights(from: Date, to: Date): Promise<ImportedReading[]>;
  bodyFat(from: Date, to: Date): Promise<ImportedReading[]>;
  workouts(from: Date, to: Date): Promise<ImportedWorkout[]>;
  shareWeight(id: string, kg: number, at: number): Promise<void>;
  shareWorkout(w: SharedWorkout): Promise<void>;
}
