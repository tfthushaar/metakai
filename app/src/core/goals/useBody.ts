import { useMemo } from 'react';

import { adaptiveTdee, type AdaptiveResult } from '../../lib/adaptiveTdee';
import { addDays, dateKey, daysBetween, parseDateKey } from '../../lib/dates';
import { ageFromBirthDate, estimateTdee, type BodyInput } from '../../lib/energy';
import { GOALS, signedRate } from '../../lib/goals';
import { predict, type Prediction } from '../../lib/prediction';
import { computeTargets, weeklyChangeAt, withCustomCalories, type TargetResult } from '../../lib/targets';
import { computeTrend, weeklyTrendChange, type TrendPoint } from '../../lib/trend';
import { dailyTotals, getActivePhase, getProfile, listWeights, type Phase, type Profile } from '../db/repo';
import { getDb } from '../db/database';
import { useQuery } from '../db/useQuery';
import { useSettings } from '../store/settings';

export interface BodyState {
  profile: Profile | null;
  phase: Phase | null;
  trend: TrendPoint[];
  currentKg: number | null;
  latestRawKg: number | null;
  weeklyChange: number | null;
  /** Today's targets after manual overrides and training/rest-day adjustment. */
  targets: TargetResult | null;
  /** Targets before manual overrides. */
  recommended: TargetResult | null;
  /** The user set their own daily calories instead of following the pace. */
  customKcal: boolean;
  /** Expected weekly change in kg: from the pace, or from custom calories against maintenance. */
  plannedWeeklyKg: number | null;
  prediction: Prediction | null;
  progress: number | null;
  etaDate: string | null;
  adaptive: (AdaptiveResult & { applied: boolean }) | null;
  /** Set when carb cycling is on. */
  dayType: 'training' | 'rest' | null;
  /** Planned end of a timed phase (diet break, mini cut, event) has passed. */
  phaseEnded: boolean;
}

export function bodyInput(profile: Profile, weightKg: number): BodyInput & { pregnant: boolean } {
  return {
    pregnant: profile.sex === 'female' && useSettings.getState().pregnant,
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    age: ageFromBirthDate(profile.birthDate),
    activity: profile.activity,
    bodyFatPct: profile.bodyFatPct,
  };
}

/** Weekdays (0 = Sunday) with a routine scheduled, and whether today has training. */
function trainingSchedule(today: string): { trainingDays: number; isTrainingDay: boolean } {
  const db = getDb();
  const rows = db.getAllSync<{ weekdays: string }>("SELECT weekdays FROM routines WHERE deleted_at IS NULL AND weekdays != '[]'");
  const days = new Set<number>();
  rows.forEach((r) => (JSON.parse(r.weekdays) as number[]).forEach((d) => days.add(d)));
  const workedOut = (db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workouts WHERE date_key = ? AND deleted_at IS NULL', [today])?.n ?? 0) > 0;
  return { trainingDays: days.size, isTrainingDay: workedOut || days.has(parseDateKey(today).getDay()) };
}

interface BodySources {
  profile: Profile | null;
  phase: Phase | null;
  weights: ReturnType<typeof listWeights>;
  intake: ReturnType<typeof dailyTotals>;
  schedule: { trainingDays: number; isTrainingDay: boolean };
  adaptiveOn: boolean;
  carbCycling: boolean;
  today: string;
}

export function useBody(): BodyState {
  const profile = useQuery(['profile'], getProfile);
  const phase = useQuery(['phases'], getActivePhase);
  const weights = useQuery(['weight_entries'], listWeights);
  const today = dateKey();
  const intakeFrom = addDays(today, -35);
  const intake = useQuery(['log_entries'], () => dailyTotals(intakeFrom), [intakeFrom]);
  const schedule = useQuery(['routines', 'workouts'], () => trainingSchedule(today), [today]);
  const adaptiveOn = useSettings((s) => s.adaptiveTargets);
  const carbCycling = useSettings((s) => s.carbCycling);
  // Read inside bodyInput; subscribed here so targets update when it changes.
  const pregnant = useSettings((s) => s.pregnant);

  return useMemo<BodyState>(
    () => computeBody({ profile, phase, weights, intake, schedule, adaptiveOn, carbCycling, today }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, phase, weights, intake, schedule, adaptiveOn, carbCycling, pregnant, today],
  );
}

/** The same body state read straight from the database, for widgets and other code outside React. */
export function readBody(): BodyState {
  const today = dateKey();
  const { adaptiveTargets, carbCycling } = useSettings.getState();
  return computeBody({
    profile: getProfile(),
    phase: getActivePhase(),
    weights: listWeights(),
    intake: dailyTotals(addDays(today, -35)),
    schedule: trainingSchedule(today),
    adaptiveOn: adaptiveTargets,
    carbCycling,
    today,
  });
}

function computeBody({ profile, phase, weights, intake, schedule, adaptiveOn, carbCycling, today }: BodySources): BodyState {
  const trend = computeTrend(weights.map((w) => ({ date: w.dateKey, kg: w.kg })));
  const last = trend[trend.length - 1];
  const currentKg = last?.trend ?? phase?.startKg ?? null;
  const latestRawKg = weights.length ? weights[weights.length - 1].kg : null;
  const weeklyChange = weeklyTrendChange(trend);
  const empty = { recommended: null, customKcal: false, plannedWeeklyKg: null, targets: null, prediction: null, progress: null, etaDate: null, adaptive: null, dayType: null, phaseEnded: false };

  if (!profile || !phase || currentKg == null) {
    return { profile, phase, trend, currentKg, latestRawKg, weeklyChange, ...empty };
  }

  const input = bodyInput(profile, currentKg);
  // Exclude today: it is usually only partly logged.
  const measured = adaptiveTdee(
    intake.filter((d) => d.dateKey < today).map((d) => ({ date: d.dateKey, kcal: d.kcal })),
    trend,
    estimateTdee(input),
    28,
  );
  const applyAdaptive = adaptiveOn && measured != null && measured.confidence >= 0.5;
  const o = phase.overrides;
  const reverse =
    phase.goalType === 'reverse' && o.reverseStartKcal
      ? { startKcal: o.reverseStartKcal, stepKcal: o.reverseStepKcal ?? 100, weeksElapsed: daysBetween(phase.startDate, today) / 7 }
      : null;

  const recommended = computeTargets({ ...input, goal: phase.goalType, ratePctWeek: phase.ratePctWeek, adaptiveTdee: applyAdaptive ? measured!.tdee : null, reverse });
  const goalInput = { ...input, goal: phase.goalType, ratePctWeek: phase.ratePctWeek };
  // Custom calories replace the pace; macros follow them unless set separately.
  const base = o.kcal != null ? withCustomCalories(recommended, goalInput, o.kcal) : recommended;
  let targets: TargetResult = {
    ...base,
    protein: o.protein ?? base.protein,
    carbs: o.carbs ?? base.carbs,
    fat: o.fat ?? base.fat,
    fiber: o.fiber ?? base.fiber,
  };
  const def = GOALS[phase.goalType];
  const plannedWeeklyKg = def.direction === 0 ? 0 : o.kcal != null ? weeklyChangeAt(base.kcal, recommended.tdee) : signedRate(phase.goalType, phase.ratePctWeek) * currentKg;

  // Carb cycling: shift ~10% of calories onto training days, keeping the weekly total.
  let dayType: BodyState['dayType'] = null;
  if (carbCycling && o.kcal == null && o.carbs == null) {
    const trainingDays = schedule.trainingDays > 0 && schedule.trainingDays < 7 ? schedule.trainingDays : 3;
    const boost = Math.round(targets.kcal * 0.1);
    const delta = schedule.isTrainingDay ? boost : -Math.round((boost * trainingDays) / (7 - trainingDays));
    const carbs = Math.max(0, targets.carbs + Math.round(delta / 4));
    targets = { ...targets, kcal: targets.kcal + (carbs - targets.carbs) * 4, carbs };
    dayType = schedule.isTrainingDay ? 'training' : 'rest';
  }

  // Forward from today's trend weight at today's calories, so changing calories changes the curve and goal date.
  const prediction = predict({
    ...goalInput,
    startDate: today,
    targetKg: phase.targetKg,
    intakeKcal: base.kcal,
    adaptiveTdee: applyAdaptive ? measured!.tdee : null,
    maxWeeks: 104,
  });

  let progress: number | null = null;
  let etaDate: string | null = null;
  if (phase.targetKg != null && def.direction !== 0) {
    const total = phase.targetKg - phase.startKg;
    // Progress follows the latest weigh-in, the same number shown as your weight everywhere.
    const nowKg = latestRawKg ?? currentKg;
    progress = total === 0 ? 1 : Math.min(1, Math.max(0, (nowKg - phase.startKg) / total));
    etaDate = progress >= 1 ? null : prediction.etaDate;
  }

  return {
    profile,
    phase,
    trend,
    currentKg,
    latestRawKg,
    weeklyChange,
    targets,
    recommended,
    customKcal: o.kcal != null,
    plannedWeeklyKg,
    prediction,
    progress,
    etaDate,
    adaptive: measured ? { ...measured, applied: applyAdaptive } : null,
    dayType,
    phaseEnded: phase.endDate != null && today > phase.endDate,
  };
}
