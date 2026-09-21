/** What the home screen widgets show, read from a real database with the app's settings faked. */
import { dateKey } from '../../lib/dates';
import { openTestDb, testDb } from '../../testing/sqliteDb';

jest.mock('../../core/db/database', () => require('../../testing/sqliteDb').database);
// Settings persist through expo-sqlite's key-value store, which only exists on a device.
jest.mock('../../core/store/settings', () => {
  const state = {
    enabledModules: ['food', 'workouts', 'water', 'recovery'],
    layouts: {} as Record<string, unknown>,
    appearance: 'system',
    accent: 'crimson',
    darkStyle: 'black',
    customColors: { primary: '#FF453A', secondary: '#0A84FF', background: null },
    adaptiveTargets: true,
    carbCycling: false,
    pregnant: false,
  };
  return { useSettings: { getState: () => state }, __state: state };
});
jest.mock('../../modules/workouts/repo', () => ({ getExercise: () => ({ primary: [], secondary: [] }) }));

import { caloriesData, quickActions, waterToday, widgetTheme } from '../data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __state: settings } = require('../../core/store/settings') as { __state: Record<string, any> };

beforeAll(openTestDb);

describe('quickActions', () => {
  it('shows the + menu defaults in order, only for features that are on', () => {
    const ids = quickActions().map((a) => a.id);
    expect(ids).toEqual(['logFood', 'weighIn', 'quickAdd', 'workout', 'logWorkout']);
    expect(quickActions()[0]).toMatchObject({ label: 'Food', uri: 'metakai://log-food' });
  });

  it('follows the layout the user arranged', () => {
    settings.layouts.quick = { order: ['workout', 'weighIn'], hidden: ['logFood'], shown: ['water'] };
    const ids = quickActions().map((a) => a.id);
    expect(ids[0]).toBe('workout');
    expect(ids.indexOf('workout')).toBeLessThan(ids.indexOf('weighIn'));
    expect(ids).not.toContain('logFood');
    expect(ids).toContain('water');
  });

  it('logs water without opening the app', () => {
    expect(quickActions().find((a) => a.id === 'water')).toMatchObject({ uri: null });
  });

  it('drops actions whose feature is off', () => {
    settings.enabledModules = ['food'];
    expect(quickActions().map((a) => a.id)).not.toContain('workout');
    settings.enabledModules = ['food', 'workouts', 'water', 'recovery'];
  });
});

describe('caloriesData', () => {
  it('has nothing to show without a goal', () => {
    expect(caloriesData()).toBeNull();
  });

  it('shows calories and macros left once a goal is set', () => {
    const now = new Date().toISOString();
    testDb.runSync(
      `INSERT INTO profile (id, name, sex, birth_date, height_cm, activity, experience, dietary_prefs, created_at, updated_at)
       VALUES ('p', 'Test', 'male', '1996-04-02', 178, 'moderate', 'intermediate', '[]', ?, ?)`,
      [now, now],
    );
    testDb.runSync(
      `INSERT INTO phases (id, goal_type, status, start_date, start_kg, target_kg, rate_pct_week, overrides, created_at, updated_at)
       VALUES ('ph', 'cut', 'active', ?, 82, 76, 0.5, '{"kcal":2000}', ?, ?)`,
      [dateKey(), now, now],
    );
    testDb.runSync(
      "INSERT INTO weight_entries (id, date_key, measured_at, kg, source, created_at, updated_at) VALUES ('w', ?, ?, 81.5, 'manual', ?, ?)",
      [dateKey(), now, now, now],
    );
    testDb.runSync(
      `INSERT INTO log_entries (id, date_key, meal_slot, name, quantity, unit, grams, kcal, protein, carbs, fat, source, created_at, updated_at)
       VALUES ('l', ?, 'lunch', 'Dal and rice', 1, 'serving', 300, 600, 25, 90, 12, 'manual', ?, ?)`,
      [dateKey(), now, now],
    );
    const data = caloriesData()!;
    expect(data.kcalTarget).toBe(2000);
    expect(data.eatenKcal).toBe(600);
    expect(data.kcalLeft).toBe(1400);
    expect(data.protein.eaten).toBe(25);
  });

  it('is off when food tracking is', () => {
    settings.enabledModules = ['workouts'];
    expect(caloriesData()).toBeNull();
    settings.enabledModules = ['food', 'workouts', 'water', 'recovery'];
  });
});

describe('waterToday', () => {
  it('adds up the day', () => {
    const now = new Date().toISOString();
    testDb.runSync("INSERT INTO water_entries (id, date_key, ml, created_at, updated_at) VALUES ('a', ?, 250, ?, ?)", [dateKey(), now, now]);
    testDb.runSync("INSERT INTO water_entries (id, date_key, ml, created_at, updated_at) VALUES ('b', ?, 500, ?, ?)", [dateKey(), now, now]);
    expect(waterToday()).toBe(750);
  });
});

describe('widgetTheme', () => {
  it('gives light and dark colours when the app follows the system', () => {
    const t = widgetTheme();
    expect(t.dark).not.toBeNull();
    expect(t.light.background).not.toBe(t.dark!.background);
  });

  it('gives one set of colours when the app is set to a single appearance', () => {
    settings.appearance = 'dark';
    const t = widgetTheme();
    expect(t.dark).toBeNull();
    expect(t.light.background).toBe('#000000');
    settings.appearance = 'system';
  });

  it('follows a custom background instead of the system', () => {
    settings.accent = 'custom';
    settings.customColors = { primary: '#22AA55', secondary: '#0A84FF', background: '#F4F0E8' };
    const t = widgetTheme();
    expect(t.dark).toBeNull();
    expect(t.light.accent).toBe('#22AA55');
  });
});
