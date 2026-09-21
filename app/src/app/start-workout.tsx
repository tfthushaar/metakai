import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { activeWorkout, startWorkout } from '../modules/workouts/repo';

/** Opened from the home screen widget: starts a workout (or returns to the one going) and shows it. */
export default function StartWorkout() {
  const router = useRouter();
  useEffect(() => {
    if (!activeWorkout()) startWorkout();
    router.replace('/workout');
  }, [router]);
  return null;
}
