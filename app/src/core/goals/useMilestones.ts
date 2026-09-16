import { useMemo } from 'react';

import { GOALS } from '../../lib/goals';
import { weightMilestones } from '../../lib/milestones';
import { useBody } from './useBody';

/** Weight checkpoints for the active cut or bulk; null for goals without a target weight. */
export function useMilestones() {
  const { phase, trend, prediction } = useBody();
  return useMemo(() => {
    if (!phase || phase.targetKg == null || GOALS[phase.goalType].direction === 0 || !prediction) return null;
    return weightMilestones({ startKg: phase.startKg, targetKg: phase.targetKg, startDate: phase.startDate, trend, prediction: prediction.points });
  }, [phase, trend, prediction]);
}

