/** Interval timer plans: Tabata, HIIT, EMOM and custom work/rest rounds. */
export type IntervalMode = 'tabata' | 'hiit' | 'emom' | 'custom';

export interface IntervalConfig {
  workSec: number;
  restSec: number;
  rounds: number;
  warmupSec: number;
  cooldownSec: number;
}

export const INTERVAL_PRESETS: Record<IntervalMode, { name: string; description: string; config: IntervalConfig }> = {
  tabata: { name: 'Tabata', description: '20 s all-out, 10 s rest, 8 rounds', config: { workSec: 20, restSec: 10, rounds: 8, warmupSec: 60, cooldownSec: 0 } },
  hiit: { name: 'HIIT', description: '40 s hard, 20 s easy, 10 rounds', config: { workSec: 40, restSec: 20, rounds: 10, warmupSec: 120, cooldownSec: 60 } },
  emom: { name: 'EMOM', description: 'Every minute on the minute, rest for what’s left', config: { workSec: 60, restSec: 0, rounds: 10, warmupSec: 0, cooldownSec: 0 } },
  custom: { name: 'Custom', description: 'Your own work, rest and rounds', config: { workSec: 30, restSec: 30, rounds: 8, warmupSec: 0, cooldownSec: 0 } },
};

export type SegmentKind = 'warmup' | 'work' | 'rest' | 'cooldown';

export interface Segment {
  kind: SegmentKind;
  seconds: number;
  /** 1-based round number; 0 for warm-up and cool-down. */
  round: number;
  /** Seconds from the start of the session. */
  startsAt: number;
}

export function buildSegments(c: IntervalConfig): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  const push = (kind: SegmentKind, seconds: number, round: number) => {
    if (seconds <= 0) return;
    out.push({ kind, seconds, round, startsAt: t });
    t += seconds;
  };
  push('warmup', c.warmupSec, 0);
  for (let r = 1; r <= c.rounds; r++) {
    push('work', c.workSec, r);
    if (r < c.rounds) push('rest', c.restSec, r);
  }
  push('cooldown', c.cooldownSec, 0);
  return out;
}

export const totalSeconds = (segments: Segment[]) => (segments.length ? segments[segments.length - 1].startsAt + segments[segments.length - 1].seconds : 0);

export interface Position {
  index: number;
  segment: Segment | null;
  /** Seconds left in the current segment. */
  remaining: number;
  done: boolean;
}

export function positionAt(segments: Segment[], elapsedSec: number): Position {
  const total = totalSeconds(segments);
  if (segments.length === 0 || elapsedSec >= total) return { index: segments.length, segment: null, remaining: 0, done: true };
  const t = Math.max(0, elapsedSec);
  let i = segments.length - 1;
  while (i > 0 && segments[i].startsAt > t) i--;
  const seg = segments[i];
  return { index: i, segment: seg, remaining: seg.startsAt + seg.seconds - t, done: false };
}

/** "1:05" or "0:20". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
