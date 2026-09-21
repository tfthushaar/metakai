import {
  adjustRepeat,
  clock,
  DEFAULT_REMINDERS,
  describe as describeReminder,
  MAX_REPEATS,
  notificationId,
  REMINDER_IDS,
  REMINDER_KIND,
  repeatTimes,
  shiftClock,
  slotKeys,
  slotsFor,
  toggleDay,
  type Reminder,
  type ReminderId,
} from '../reminders';

const on = (id: ReminderId, patch: Partial<Reminder> = {}): Reminder => ({ ...DEFAULT_REMINDERS[id], on: true, ...patch });

describe('the reminder list', () => {
  it('lists every reminder once, each with defaults that match its kind', () => {
    expect([...REMINDER_IDS].sort()).toEqual(Object.keys(DEFAULT_REMINDERS).sort());
    expect(new Set(REMINDER_IDS).size).toBe(REMINDER_IDS.length);
    for (const id of REMINDER_IDS) {
      const r = DEFAULT_REMINDERS[id];
      expect(r.on).toBe(false);
      if (REMINDER_KIND[id] === 'weekly') expect(r.weekday).toBeGreaterThanOrEqual(1);
      if (REMINDER_KIND[id] === 'days') expect(r.days?.length).toBeGreaterThan(0);
      if (REMINDER_KIND[id] === 'repeat') expect([r.everyHours, r.untilHour].every((n) => typeof n === 'number')).toBe(true);
    }
  });
});

describe('what a reminder turns into', () => {
  it('is one daily notification for a daily reminder', () => {
    expect(slotsFor('weighIn', on('weighIn'))).toEqual([{ key: '', when: { kind: 'daily', hour: 7, minute: 30 } }]);
  });

  it('is one weekly notification on the chosen weekday for a weekly reminder', () => {
    expect(slotsFor('review', on('review', { weekday: 6, hour: 19, minute: 15 }))).toEqual([{ key: '', when: { kind: 'weekly', weekday: 6, hour: 19, minute: 15 } }]);
  });

  it('is a weekly notification for each chosen day, once each, in order', () => {
    const slots = slotsFor('workout', on('workout', { days: [6, 2, 2, 4, 9, 0], hour: 17, minute: 30 }));
    expect(slots.map((s) => s.key)).toEqual(['2', '4', '6']);
    expect(slots.every((s) => s.when.kind === 'weekly' && s.when.hour === 17 && s.when.minute === 30)).toBe(true);
    expect(slots.map((s) => (s.when.kind === 'weekly' ? s.when.weekday : 0))).toEqual([2, 4, 6]);
  });

  it('is nothing for training days with none chosen', () => {
    expect(slotsFor('workout', on('workout', { days: [] }))).toEqual([]);
  });

  it('repeats through the day from the start time until the end hour', () => {
    expect(repeatTimes(on('water', { hour: 9, minute: 0, everyHours: 2, untilHour: 21 })).map((t) => t / 60)).toEqual([9, 11, 13, 15, 17, 19, 21]);
    // Half past keeps its half past, and doesn't run over the end hour.
    expect(repeatTimes(on('water', { hour: 9, minute: 30, everyHours: 3, untilHour: 21 })).map((t) => t / 60)).toEqual([9.5, 12.5, 15.5, 18.5]);
    expect(slotsFor('water', on('water', { hour: 9, minute: 30, everyHours: 3, untilHour: 21 })).map((s) => s.when)).toEqual([
      { kind: 'daily', hour: 9, minute: 30 },
      { kind: 'daily', hour: 12, minute: 30 },
      { kind: 'daily', hour: 15, minute: 30 },
      { kind: 'daily', hour: 18, minute: 30 },
    ]);
  });

  it('never makes more than the limit in a day, and always at least the first', () => {
    expect(repeatTimes(on('water', { hour: 0, minute: 0, everyHours: 1, untilHour: 23 }))).toHaveLength(MAX_REPEATS);
    expect(repeatTimes(on('water', { hour: 22, minute: 0, everyHours: 2, untilHour: 9 }))).toEqual([22 * 60]);
  });

  it('only uses keys that can be cleared later', () => {
    const wide: Partial<Reminder> = { days: [1, 2, 3, 4, 5, 6, 7], hour: 0, minute: 0, everyHours: 1, untilHour: 23, weekday: 7 };
    for (const id of REMINDER_IDS) {
      const keys = slotsFor(id, on(id, wide)).map((s) => s.key);
      expect(keys.every((k) => slotKeys(id).includes(k))).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps the identifiers earlier versions scheduled under', () => {
    expect(notificationId('weighIn', '')).toBe('reminder-weighIn');
    expect(notificationId('logFood', '')).toBe('reminder-logFood');
    expect(notificationId('photos', '')).toBe('reminder-photos');
    expect(notificationId('workout', '4')).toBe('reminder-workout-4');
  });
});

describe('times of day', () => {
  it('reads as on a 12-hour clock', () => {
    expect(clock(0)).toBe('12:00 AM');
    expect(clock(7, 30)).toBe('7:30 AM');
    expect(clock(12, 5)).toBe('12:05 PM');
    expect(clock(23, 45)).toBe('11:45 PM');
  });

  it('shifts around midnight either way', () => {
    expect(shiftClock(23, 45, 30)).toEqual({ hour: 0, minute: 15 });
    expect(shiftClock(0, 10, -30)).toEqual({ hour: 23, minute: 40 });
    expect(shiftClock(7, 30, 15)).toEqual({ hour: 7, minute: 45 });
  });
});

describe('the list text', () => {
  it('says when each kind comes', () => {
    expect(describeReminder('weighIn', on('weighIn'))).toBe('Daily');
    expect(describeReminder('photos', on('photos'))).toBe('Weekly');
    expect(describeReminder('workout', on('workout', { days: [6, 2, 4] }))).toBe('Mon, Wed, Fri');
    expect(describeReminder('workout', on('workout', { days: [] }))).toBe('No days chosen');
    expect(describeReminder('water', on('water'))).toBe('Every 2 hours, 9:00 AM to 9:00 PM');
    expect(describeReminder('water', on('water', { everyHours: 1 }))).toBe('Every hour, 9:00 AM to 9:00 PM');
  });
});

describe('editing', () => {
  it('turns training days on and off, but keeps the last one', () => {
    expect(toggleDay([2, 4], 6)).toEqual([2, 4, 6]);
    expect(toggleDay([2, 4, 6], 4)).toEqual([2, 6]);
    expect(toggleDay([2], 2)).toEqual([2]);
    expect(toggleDay(undefined, 3)).toEqual([3]);
  });

  it('keeps a repeating reminder within reason', () => {
    const water = on('water', { hour: 9, minute: 0, everyHours: 2, untilHour: 21 });
    expect(adjustRepeat(water, { everyHours: 0 }).everyHours).toBe(1);
    expect(adjustRepeat(water, { everyHours: 9 }).everyHours).toBe(6);
    expect(adjustRepeat(water, { untilHour: 30 }).untilHour).toBe(23);
    // It has to stop after it starts.
    expect(adjustRepeat(water, { untilHour: 3 }).untilHour).toBe(10);
    expect(adjustRepeat({ ...water, hour: 12 }, {}).untilHour).toBe(21);
    expect(adjustRepeat({ ...water, hour: 22 }, {}).untilHour).toBe(23);
  });
});
