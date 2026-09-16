import { useMemo } from 'react';

import { adaptiveTdee, type AdaptiveResult } from '../../lib/adaptiveTdee';
import { addDays, dateKey, daysBetween, parseDateKey } from '../../lib/dates';
import { ageFromBirthDate, estimateTdee, type BodyInput } from '../../lib/energy';
import { GOALS } from '../../lib/goals';
import { expectedOn, predict, type Prediction } from '../../lib/prediction';
import { computeTargets, type TargetResult } from '../../lib/targets';
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
  prediction: Prediction | null;
  /** Positive = ahead of plan (further toward the goal than expected). */
  aheadKg: number | null;
  progress: number | null;
  etaDate: string | null;
  adaptive: (AdaptiveResult & { applied: boolean }) | null;
  /** Set when carb cycling is on. */
  dayType: 'training' | 'rest' | null;
  /** Planned end of a timed phase (diet break, mini cut, event) has passed. */
  phaseEnded: boolean;
}

export function bodyInput(profile: Profile, weightKg: number): BodyInput {
  return {
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

  return useMemo<BodyState>(() => {
    const trend = computeTrend(weights.map((w) => ({ date: w.dateKey, kg: w.kg })));
    const last = trend[trend.length - 1];
    const currentKg = last?.trend ?? phase?.startKg ?? null;
    const latestRawKg = weights.length ? weights[weights.length - 1].kg : null;
    const weeklyChange = weeklyTrendChange(trend);
    const empty = { recommended: null, targets: null, prediction: null, aheadKg: null, progress: null, etaDate: null, adaptive: null, dayType: null, phaseEnded: false };

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
    let targets: TargetResult = {
      ...recommended,
      kcal: o.kcal ?? recommended.kcal,
      protein: o.protein ?? recommended.protein,
      carbs: o.carbs ?? recommended.carbs,
      fat: o.fat ?? recommended.fat,
      fiber: o.fiber ?? recommended.fiber,
    };

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

    const startTargets = computeTargets({ ...bodyInput(profile, phase.startKg), goal: phase.goalType, ratePctWeek: phase.ratePctWeek, reverse });
    const prediction = predict({
      ...bodyInput(profile, phase.startKg),
      goal: phase.goalType,
      startDate: phase.startDate,
      targetKg: phase.targetKg,
      intakeKcal: o.kcal ?? startTargets.kcal,
      maxWeeks: 104,
    });

    const def = GOALS[phase.goalType];
    const expected = expectedOn(prediction, today);
    const aheadKg = expected != null && def.direction !== 0 ? (currentKg - expected) * -def.direction : null;

    let progress: number | null = null;
    let etaDate = prediction.etaDate;
    if (phase.targetKg != null && def.direction !== 0) {
      const total = phase.targetKg - phase.startKg;
      progress = total === 0 ? 1 : Math.min(1, Math.max(0, (currentKg - phase.startKg) / total));
      const remaining = phase.targetKg - currentKg;
      const movingRightWay = weeklyChange != null && Math.sign(weeklyChange) === Math.sign(remaining) && Math.abs(weeklyChange) > 0.05;
      if (movingRightWay && daysBetween(phase.startDate, today) >= 14) {
        const weeks = remaining / weeklyChange!;
        if (weeks < 156) etaDate = addDays(today, Math.round(weeks * 7));
      }
      if (progress >= 1) etaDate = null;
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
      prediction,
      aheadKg,
      progress,
      etaDate,
      adaptive: measured ? { ...measured, applied: applyAdaptive } : null,
      dayType,
      phaseEnded: phase.endDate != null && today > phase.endDate,
    };
  }, [profile, phase, weights, intake, schedule, adaptiveOn, carbCycling, today]);
}
