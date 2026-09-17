import type { Checkin } from '../checkin';
import { coachPayload, parseCoachReply } from '../coach';

const week = (over: Partial<Checkin> = {}): Checkin => ({
  weekStart: '2026-09-01',
  weekEnd: '2026-09-07',
  daysLogged: 6,
  avgKcal: 2143.6,
  kcalAdherence: 0.7,
  proteinDaysHit: 4,
  weeklyChangeKg: -0.4567,
  plannedWeeklyKg: -0.5,
  verdict: 'on_track',
  headline: 'Right on track',
  suggestion: null,
  kcalAdjustment: 0,
  workouts: 3,
  plannedWorkouts: 4,
  ...over,
});

describe('coach', () => {
  it('sends only rounded weekly aggregates', () => {
    const payload = JSON.parse(
      coachPayload({ goal: 'Cut', sex: 'male', age: 30, experience: 'intermediate', weightKg: 82.34, targetKcal: 2200, targetProtein: 160, minimumKcal: 1500, maintenanceKcal: null, weeks: [week()] }),
    );
    expect(payload.weightKg).toBe(82.3);
    expect(payload.weeks[0]).toEqual({ weeksAgo: 0, daysFoodLogged: 6, avgKcal: 2144, proteinTargetDays: 4, weightChangeKg: -0.46, plannedChangeKg: -0.5, workouts: 3, plannedWorkouts: 4, status: 'on_track' });
    expect(JSON.stringify(payload)).not.toMatch(/2026|headline/);
  });

  it('cleans and caps answers', () => {
    const reply = parseCoachReply(
      'Here you go: {"summary": "**Solid** week.", "notes": [{"title": "Protein", "detail": "Add a shake."}, {"title": "", "detail": "x"}, {"title": "a", "detail": "b"}, {"title": "c", "detail": "d"}, {"title": "e", "detail": "f"}]}',
    );
    expect(reply).toEqual({ summary: 'Solid week.', notes: [{ title: 'Protein', detail: 'Add a shake.' }, { title: 'a', detail: 'b' }, { title: 'c', detail: 'd' }] });
  });

  it('drops unsafe advice', () => {
    expect(parseCoachReply('{"summary": "Try a water cut before weigh-in.", "notes": []}')).toBeNull();
    const reply = parseCoachReply('{"summary": "Good.", "notes": [{"title": "Speed it up", "detail": "Use a diuretic."}, {"title": "Sleep", "detail": "Aim for 8 hours."}]}');
    expect(reply?.notes).toEqual([{ title: 'Sleep', detail: 'Aim for 8 hours.' }]);
    expect(parseCoachReply('not json')).toBeNull();
  });
});
