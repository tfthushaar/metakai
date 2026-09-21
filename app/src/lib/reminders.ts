import type { ModuleId } from '../core/features/registry';

/**
 * Reminders: what each one is, and which notifications it turns into. Pure, so it can be tested without
 * a phone; core/reminders.ts schedules the result.
 */

export interface Reminder {
  on: boolean;
  hour: number;
  minute: number;
  /** Weekly reminders: 1 = Sunday … 7 = Saturday. */
  weekday?: number;
  /** Training-day reminders: the weekdays they come on (1 = Sunday … 7 = Saturday). */
  days?: number[];
  /** Repeating reminders (water): come again every this many hours after the start time, until `untilHour`. */
  everyHours?: number;
  untilHour?: number;
}

export type ReminderId = 'weighIn' | 'logFood' | 'photos' | 'workout' | 'checkIn' | 'review' | 'water' | 'supplements' | 'habits';

/** In the order the Reminders screen lists them. */
export const REMINDER_IDS: ReminderId[] = ['weighIn', 'logFood', 'water', 'workout', 'checkIn', 'review', 'supplements', 'habits', 'photos'];

/** Once a day, once a week, on chosen weekdays, or repeatedly through the day. */
export type ReminderKind = 'daily' | 'weekly' | 'days' | 'repeat';

export const REMINDER_KIND: Record<ReminderId, ReminderKind> = {
  weighIn: 'daily',
  logFood: 'daily',
  photos: 'weekly',
  workout: 'days',
  checkIn: 'daily',
  review: 'weekly',
  water: 'repeat',
  supplements: 'daily',
  habits: 'daily',
};

export const DEFAULT_REMINDERS: Record<ReminderId, Reminder> = {
  weighIn: { on: false, hour: 7, minute: 30 },
  logFood: { on: false, hour: 21, minute: 0 },
  photos: { on: false, hour: 8, minute: 0, weekday: 1 },
  workout: { on: false, hour: 17, minute: 30, days: [2, 4, 6] },
  checkIn: { on: false, hour: 7, minute: 45 },
  review: { on: false, hour: 18, minute: 0, weekday: 1 },
  water: { on: false, hour: 9, minute: 0, everyHours: 2, untilHour: 21 },
  supplements: { on: false, hour: 8, minute: 0 },
  habits: { on: false, hour: 20, minute: 0 },
};

/** The feature a reminder belongs to. It's only offered, and only sent, while that feature is on. */
export const REMINDER_FEATURE: Partial<Record<ReminderId, ModuleId>> = {
  logFood: 'food',
  photos: 'photos',
  workout: 'workouts',
  checkIn: 'recovery',
  water: 'water',
  supplements: 'health',
  habits: 'habits',
};

/** The most notifications a repeating reminder makes in a day. */
export const MAX_REPEATS = 12;

/** One notification a reminder makes. `key` tells them apart within a reminder. */
export interface Slot {
  key: string;
  when: { kind: 'daily'; hour: number; minute: number } | { kind: 'weekly'; weekday: number; hour: number; minute: number };
}

/** Minutes after midnight at which a repeating reminder comes: the start time, then every N hours up to the end hour. */
export function repeatTimes(r: Reminder): number[] {
  const start = r.hour * 60 + r.minute;
  const every = Math.max(1, Math.round(r.everyHours ?? 2)) * 60;
  const end = Math.min(23, r.untilHour ?? 21) * 60;
  const times: number[] = [];
  for (let t = start; t <= end && times.length < MAX_REPEATS; t += every) times.push(t);
  return times.length ? times : [start];
}

const validDays = (days: number[] | undefined) => [...new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);

/** The notifications to schedule for a reminder that is on. */
export function slotsFor(id: ReminderId, r: Reminder): Slot[] {
  switch (REMINDER_KIND[id]) {
    case 'repeat':
      return repeatTimes(r).map((t, i) => ({ key: String(i), when: { kind: 'daily', hour: Math.floor(t / 60), minute: t % 60 } }));
    case 'days':
      return validDays(r.days).map((weekday) => ({ key: String(weekday), when: { kind: 'weekly', weekday, hour: r.hour, minute: r.minute } }));
    case 'weekly':
      return [{ key: '', when: { kind: 'weekly', weekday: r.weekday ?? 1, hour: r.hour, minute: r.minute } }];
    default:
      return [{ key: '', when: { kind: 'daily', hour: r.hour, minute: r.minute } }];
  }
}

/** Every key a reminder's notifications can have, so all of them can be cleared before scheduling again. */
export function slotKeys(id: ReminderId): string[] {
  switch (REMINDER_KIND[id]) {
    case 'repeat':
      return Array.from({ length: MAX_REPEATS }, (_, i) => String(i));
    case 'days':
      return ['1', '2', '3', '4', '5', '6', '7'];
    default:
      return [''];
  }
}

/** The identifier a reminder's notification is scheduled under. The unkeyed ones keep the names earlier versions used. */
export const notificationId = (id: ReminderId, key: string) => (key ? `reminder-${id}-${key}` : `reminder-${id}`);

const pad = (n: number) => String(n).padStart(2, '0');

/** 7:30 AM */
export function clock(hour: number, minute = 0): string {
  return `${((hour + 11) % 12) + 1}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Moves a time of day by some minutes, around midnight. */
export function shiftClock(hour: number, minute: number, minutes: number): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + minutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A short line about when a reminder comes, for the list. */
export function describe(id: ReminderId, r: Reminder): string {
  switch (REMINDER_KIND[id]) {
    case 'repeat': {
      const every = Math.max(1, Math.round(r.everyHours ?? 2));
      return `Every ${every === 1 ? 'hour' : `${every} hours`}, ${clock(r.hour, r.minute)} to ${clock(Math.min(23, r.untilHour ?? 21), 0)}`;
    }
    case 'days': {
      const days = validDays(r.days);
      return days.length ? days.map((d) => WEEKDAY_NAMES[d - 1]).join(', ') : 'No days chosen';
    }
    case 'weekly':
      return 'Weekly';
    default:
      return 'Daily';
  }
}

/** Turns a weekday on or off for a training-day reminder. The last one stays, so the reminder always comes. */
export function toggleDay(days: number[] | undefined, day: number): number[] {
  const current = validDays(days);
  if (!current.includes(day)) return validDays([...current, day]);
  return current.length > 1 ? current.filter((d) => d !== day) : current;
}

/** Changes how often a repeating reminder comes (1 to 6 hours), and when it stops for the day. */
export function adjustRepeat(r: Reminder, change: { everyHours?: number; untilHour?: number }): Reminder {
  const everyHours = Math.min(6, Math.max(1, change.everyHours ?? r.everyHours ?? 2));
  // It has to stop after it starts, and by 11 PM.
  const untilHour = Math.min(23, Math.max(r.hour + 1, change.untilHour ?? r.untilHour ?? 21));
  return { ...r, everyHours, untilHour };
}
