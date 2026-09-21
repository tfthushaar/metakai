/**
 * Maths for the ruler picker (`ui/RulerPicker`): a strip of ticks, one per `step`, that slides under
 * a fixed indicator. Positions are pixel offsets from the first tick.
 */

/** Width of one tick, in pixels. */
export const RULER_TICK = 10;

export interface RulerScale {
  min: number;
  max: number;
  step: number;
}

export const tickCount = (s: RulerScale) => Math.round((s.max - s.min) / s.step) + 1;

/** The tick a value sits on, kept within the ruler. */
export const indexOfValue = (s: RulerScale, value: number) => Math.min(tickCount(s) - 1, Math.max(0, Math.round((value - s.min) / s.step)));

/** The value at a tick, free of floating-point dust (0.1 steps stay 0.1). */
export const valueOfIndex = (s: RulerScale, index: number) => Number((s.min + index * s.step).toFixed(4));

/** Farthest the strip can slide: the last tick under the indicator. */
export const maxOffset = (s: RulerScale) => (tickCount(s) - 1) * RULER_TICK;

export const clampOffset = (s: RulerScale, offset: number) => Math.min(maxOffset(s), Math.max(0, offset));

/** The tick under the indicator at a given offset. */
export const indexAtOffset = (s: RulerScale, offset: number) => Math.min(tickCount(s) - 1, Math.max(0, Math.round(offset / RULER_TICK)));

/** How long momentum lasts: a release at 1 px/ms coasts about 160 px, short enough to still land on a value. */
const GLIDE_MS = 160;

/** One frame of momentum: velocity (px/ms) decays smoothly, and the strip travels the matching distance. */
export function glide(offset: number, velocity: number, dtMs: number): { offset: number; velocity: number } {
  const decay = Math.exp(-dtMs / GLIDE_MS);
  return { offset: offset + velocity * GLIDE_MS * (1 - decay), velocity: velocity * decay };
}

/** Speed of a pointer at release (px/ms, positive to the right), from its recent positions. Zero if it had stopped. */
export function releaseVelocity(samples: { t: number; x: number }[], releasedAt: number): number {
  const recent = samples.filter((p) => releasedAt - p.t <= 100);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  return (last.x - first.x) / Math.max(1, last.t - first.t);
}

/** Where a key press moves the ruler, or null for keys it doesn't use. */
export function indexForKey(key: string, index: number, count: number, major: number): number | null {
  const to = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return to(index + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return to(index - 1);
    case 'PageUp':
      return to(index + major);
    case 'PageDown':
      return to(index - major);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
