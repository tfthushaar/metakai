import { useEffect } from 'react';
import { AppState } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { subscribe } from '../core/db/database';
import { useSettings } from '../core/store/settings';
import { renderWidget, WIDGET_NAMES } from './render';

let timer: ReturnType<typeof setTimeout> | null = null;

/** Redraws every widget on the home screen with fresh data. */
export function refreshWidgets() {
  for (const name of WIDGET_NAMES) {
    requestWidgetUpdate({ widgetName: name, renderWidget: (info) => renderWidget(name, info)! }).catch(() => {});
  }
}

function soon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    refreshWidgets();
  }, 1500);
}

/** Keeps widgets current: after anything they show changes, and when the app goes to the background. */
export function useWidgetRefresh() {
  useEffect(() => {
    const unwatch = subscribe(
      ['log_entries', 'phases', 'profile', 'weight_entries', 'water_entries', 'recovery_checkins', 'health_markers', 'sleep_nights', 'workouts', 'workout_sets', 'cardio_sessions', 'routines'],
      soon,
    );
    // Colours, features, quick actions and target settings.
    const unsettle = useSettings.subscribe((s, prev) => {
      const keys = ['appearance', 'accent', 'darkStyle', 'customColors', 'enabledModules', 'layouts', 'adaptiveTargets', 'carbCycling', 'pregnant'] as const;
      if (keys.some((k) => s[k] !== prev[k])) soon();
    });
    const app = AppState.addEventListener('change', (state) => state === 'background' && refreshWidgets());
    return () => {
      unwatch();
      unsettle();
      app.remove();
    };
  }, []);
}
