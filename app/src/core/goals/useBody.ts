import { useMemo } from 'react';

import { dateKey, addDays, daysBetween } from '../../lib/dates';
import { ageFromBirthDate, type BodyInput } from '../../lib/energy';
import { GOALS } from '../../lib/goals';
import { expectedOn, predict, type Prediction } from '../../lib/prediction';
import { computeTargets, type TargetResult } from '../../lib/targets';
import { computeTrend, weeklyTrendChange, type TrendPoint } from '../../lib/trend';
import { getActivePhase, getProfile, listWeights, type Phase, type Profile } from '../db/repo';
import { useQuery } from '../db/useQuery';

export interface BodyState {
  profile: Profile | null;
  phase: Phase | null;
  trend: TrendPoint[];
  currentKg: number | null;
  latestRawKg: number | null;
  weeklyChange: number | null;
  targets: TargetResult | null;
  prediction: Prediction | null;
  /** Positive = ahead of plan (further toward the goal than expected). */
  aheadKg: number | null;
  progress: number | null;
  etaDate: string | null;
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

export function useBody(): BodyState {
  const profile = useQuery(['profile'], getProfile);
  const phase = useQuery(['phases'], getActivePhase);
  const weights = useQuery(['weight_entries'], listWeights);

  return useMemo(() => {
    const trend = computeTrend(weights.map((w) => ({ date: w.dateKey, kg: w.kg })));
    const last = trend[trend.length - 1];
    const currentKg = last?.trend ?? phase?.startKg ?? null;
    const latestRawKg = weights.length ? weights[weights.length - 1].kg : null;
    const weeklyChange = weeklyTrendChange(trend);

    if (!profile || !phase || currentKg == null) {
      return { profile, phase, trend, currentKg, latestRawKg, weeklyChange, targets: null, prediction: null, aheadKg: null, progress: null, etaDate: null };
    }

    const base = computeTargets({ ...bodyInput(profile, currentKg), goal: phase.goalType, ratePctWeek: phase.ratePctWeek });
    const o = phase.overrides;
    const targets: TargetResult = {
      ...base,
      kcal: o.kcal ?? base.kcal,
      protein: o.protein ?? base.protein,
      carbs: o.carbs ?? base.carbs,
      fat: o.fat ?? base.fat,
      fiber: o.fiber ?? base.fiber,
    };

    const startTargets = computeTargets({ ...bodyInput(profile, phase.startKg), goal: phase.goalType, ratePctWeek: phase.ratePctWeek });
    const prediction = predict({
      ...bodyInput(profile, phase.startKg),
      goal: phase.goalType,
      startDate: phase.startDate,
      targetKg: phase.targetKg,
      intakeKcal: o.kcal ?? startTargets.kcal,
      maxWeeks: 104,
    });

    const def = GOALS[phase.goalType];
    const today = dateKey();
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

    return { profile, phase, trend, currentKg, latestRawKg, weeklyChange, targets, prediction, aheadKg, progress, etaDate };
  }, [profile, phase, weights]);
}
