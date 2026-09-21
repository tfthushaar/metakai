/** Scheduling reminders from settings, with the phone's notifications and the saved settings faked. */
jest.mock('../notify', () => ({
  cancelNotification: jest.fn(async () => {}),
  notificationsAllowed: jest.fn(async () => true),
  scheduleNotification: jest.fn(async (spec: { id?: string }) => spec.id ?? ''),
}));
jest.mock('../store/settings', () => {
  const state = { reminders: {}, enabledModules: [] };
  return { useSettings: { getState: () => state }, __state: state };
});

import { CONTENT, reminderOffered, syncReminders } from '../reminders';
import { DEFAULT_REMINDERS, REMINDER_IDS } from '../../lib/reminders';

const notifications = jest.requireMock('../notify') as {
  cancelNotification: jest.Mock<Promise<void>, [string]>;
  notificationsAllowed: jest.Mock<Promise<boolean>, [boolean?]>;
  scheduleNotification: jest.Mock<Promise<string>, [{ id?: string }]>;
};
const settings = (jest.requireMock('../store/settings') as { __state: { reminders: Record<string, unknown>; enabledModules: string[] } }).__state;

const scheduled = () => notifications.scheduleNotification.mock.calls.map(([spec]) => spec as { id: string; title: string; url: string; channel: string; when: unknown });
const ids = () => scheduled().map((s) => s.id);

beforeEach(() => {
  notifications.cancelNotification.mockReset().mockResolvedValue(undefined);
  notifications.notificationsAllowed.mockReset().mockResolvedValue(true);
  notifications.scheduleNotification.mockReset().mockImplementation(async (spec) => spec.id ?? '');
  settings.reminders = { ...DEFAULT_REMINDERS };
  settings.enabledModules = ['food', 'water', 'workouts', 'recovery', 'health', 'habits', 'photos'];
});

describe('syncReminders', () => {
  it('schedules nothing, and asks for nothing, when every reminder is off', async () => {
    expect(await syncReminders()).toBe(true);
    expect(scheduled()).toEqual([]);
    expect(notifications.notificationsAllowed).not.toHaveBeenCalled();
  });

  it('clears every notification a reminder could have left before scheduling again', async () => {
    await syncReminders();
    const cancelled = notifications.cancelNotification.mock.calls.map(([id]) => id);
    expect(cancelled).toEqual(expect.arrayContaining(['reminder-weighIn', 'reminder-logFood', 'reminder-photos', 'reminder-workout-1', 'reminder-workout-7', 'reminder-water-0', 'reminder-water-11']));
    expect(new Set(cancelled).size).toBe(cancelled.length);
  });

  it('schedules each reminder that is on, and opens the right screen from it', async () => {
    settings.reminders = {
      ...DEFAULT_REMINDERS,
      weighIn: { ...DEFAULT_REMINDERS.weighIn, on: true },
      review: { ...DEFAULT_REMINDERS.review, on: true, weekday: 7 },
      workout: { ...DEFAULT_REMINDERS.workout, on: true, days: [2, 5] },
    };
    expect(await syncReminders()).toBe(true);
    expect(ids()).toEqual(['reminder-weighIn', 'reminder-workout-2', 'reminder-workout-5', 'reminder-review']);
    const [weighIn, monday] = scheduled();
    expect(weighIn).toMatchObject({ channel: 'reminders', title: CONTENT.weighIn.title, url: 'metakai://log-weight', when: { kind: 'daily', hour: 7, minute: 30 } });
    expect(monday).toMatchObject({ url: 'metakai://start-workout', when: { kind: 'weekly', weekday: 2, hour: 17, minute: 30 } });
    expect(scheduled()[3]).toMatchObject({ url: 'metakai://checkin', when: { kind: 'weekly', weekday: 7, hour: 18, minute: 0 } });
  });

  it('repeats water through the day', async () => {
    settings.reminders = { ...DEFAULT_REMINDERS, water: { ...DEFAULT_REMINDERS.water, on: true, everyHours: 4 } };
    await syncReminders();
    expect(ids()).toEqual(['reminder-water-0', 'reminder-water-1', 'reminder-water-2', 'reminder-water-3']);
    expect(scheduled().map((s) => (s.when as { hour: number }).hour)).toEqual([9, 13, 17, 21]);
  });

  it('skips the reminders of features that are switched off', async () => {
    settings.reminders = {
      ...DEFAULT_REMINDERS,
      water: { ...DEFAULT_REMINDERS.water, on: true },
      habits: { ...DEFAULT_REMINDERS.habits, on: true },
      weighIn: { ...DEFAULT_REMINDERS.weighIn, on: true },
    };
    settings.enabledModules = ['food', 'habits'];
    await syncReminders();
    expect(ids()).toEqual(['reminder-weighIn', 'reminder-habits']);
  });

  it('fills in settings saved before a reminder existed', async () => {
    settings.reminders = { weighIn: { on: true, hour: 6, minute: 0 }, workout: { on: true, hour: 8, minute: 0 } };
    await syncReminders();
    // No training days saved, so the usual ones.
    expect(ids()).toEqual(['reminder-weighIn', 'reminder-workout-2', 'reminder-workout-4', 'reminder-workout-6']);
  });

  it('says so, and schedules nothing, when notifications are not allowed', async () => {
    settings.reminders = { ...DEFAULT_REMINDERS, logFood: { ...DEFAULT_REMINDERS.logFood, on: true } };
    notifications.notificationsAllowed.mockResolvedValue(false);
    expect(await syncReminders()).toBe(false);
    expect(scheduled()).toEqual([]);
  });

  it('finishes one change before it starts the next', async () => {
    const events: string[] = [];
    notifications.cancelNotification.mockImplementation(async (id) => {
      if (id === 'reminder-weighIn') events.push('clear');
    });
    notifications.scheduleNotification.mockImplementation(async (spec) => {
      await Promise.resolve();
      events.push('schedule');
      return spec.id ?? '';
    });
    settings.reminders = { ...DEFAULT_REMINDERS, weighIn: { ...DEFAULT_REMINDERS.weighIn, on: true } };
    await Promise.all([syncReminders(), syncReminders()]);
    expect(events).toEqual(['clear', 'schedule', 'clear', 'schedule']);
  });
});

describe('what each reminder says', () => {
  it('has words and a link for every reminder', () => {
    for (const id of REMINDER_IDS) {
      expect(CONTENT[id].title.length).toBeGreaterThan(0);
      expect(CONTENT[id].body.length).toBeGreaterThan(0);
      expect(CONTENT[id].url).toMatch(/^metakai:\/\//);
    }
  });

  it('is offered while its feature is on', () => {
    expect(reminderOffered('weighIn', [])).toBe(true);
    expect(reminderOffered('water', [])).toBe(false);
    expect(reminderOffered('water', ['water'])).toBe(true);
    expect(reminderOffered('workout', ['food'])).toBe(false);
  });
});
