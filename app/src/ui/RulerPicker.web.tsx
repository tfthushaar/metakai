import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { clampOffset, glide, indexAtOffset, indexForKey, indexOfValue, releaseVelocity, RULER_TICK as TICK, tickCount, valueOfIndex } from '../lib/ruler';
import type { RulerPickerProps } from './RulerPicker';
import { Text } from './Text';

/**
 * The web ruler. Browsers can't be trusted to scroll a strip like a phone does: react-native-web never
 * reports a drag, ignores snapping, and a mouse can't drag a scroll area at all. So this moves the strip
 * itself from pointer events (mouse, touch and pen), with momentum, snapping, trackpad and shift-wheel
 * scrolling and the keyboard, and presents itself to screen readers as a slider.
 */

const HEIGHT = 76;

const Tick = memo(function Tick({ index, major, label, color, labelColor }: { index: number; major: boolean; label?: string; color: string; labelColor: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: index * TICK, width: TICK, height: HEIGHT }}>
      <div style={{ position: 'absolute', top: 0, left: (TICK - 2) / 2, width: 2, height: major ? 34 : 18, borderRadius: 1, background: color, opacity: major ? 1 : 0.55 }} />
      {label != null && (
        <Text variant="caption" color={labelColor} style={{ position: 'absolute', top: 40, left: (TICK - 48) / 2, width: 48, maxWidth: 48, textAlign: 'center' }} numberOfLines={1}>
          {label}
        </Text>
      )}
    </div>
  );
});

interface Drag {
  id: number;
  startX: number;
  startOffset: number;
  samples: { t: number; x: number }[];
}

export function RulerPicker({ min, max, step, value, onChange, majorEvery = 10, width, format }: RulerPickerProps) {
  const { colors } = useTheme();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const scale = useMemo(() => ({ min, max, step }), [min, max, step]);
  const count = tickCount(scale);

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** Pixels the strip has slid, kept out of React state so dragging never waits for a render. */
  const offset = useRef(indexOfValue(scale, value) * TICK);
  const index = useRef(indexOfValue(scale, value));
  /** The tick an animation is heading for, so quick key presses add up. */
  const target = useRef<number | null>(null);
  /** True while a drag, glide, scroll or key press is moving the strip, so its own movement reports values. */
  const userDriven = useRef(false);
  const frame = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const [center, setCenter] = useState(index.current);
  const [ring, setRing] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const place = useCallback((o: number) => {
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${width / 2 - TICK / 2 - o}px, 0, 0)`;
  }, [width]);

  const setOffset = useCallback(
    (next: number) => {
      const o = clampOffset(scale, next);
      offset.current = o;
      place(o);
      const i = indexAtOffset(scale, o);
      if (i !== index.current) {
        index.current = i;
        setCenter(i);
        if (userDriven.current) onChangeRef.current(valueOfIndex(scale, i));
      }
    },
    [scale, place],
  );

  const stop = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const animateTo = useCallback(
    (to: number, ms: number, done?: () => void) => {
      stop();
      const from = offset.current;
      if (ms <= 0 || Math.abs(to - from) < 0.5) {
        setOffset(to);
        done?.();
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        setOffset(from + (to - from) * (1 - (1 - p) ** 3));
        if (p < 1) {
          frame.current = requestAnimationFrame(tick);
        } else {
          frame.current = null;
          done?.();
        }
      };
      frame.current = requestAnimationFrame(tick);
    },
    [setOffset, stop],
  );

  /** Settles on the nearest tick, so the value saved is exactly the one shown. */
  const snap = useCallback(() => {
    target.current = null;
    animateTo(index.current * TICK, reduceMotion ? 0 : 130, () => {
      userDriven.current = false;
    });
  }, [animateTo, reduceMotion]);

  const startGlide = useCallback(
    (velocity: number) => {
      stop();
      const end = (count - 1) * TICK;
      let v = velocity;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        const next = glide(offset.current, v, dt);
        v = next.velocity;
        setOffset(next.offset);
        if (next.offset <= 0 || next.offset >= end || Math.abs(v) < 0.03) {
          frame.current = null;
          snap();
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [count, setOffset, snap, stop],
  );

  // Follow value changes made elsewhere (the +/- buttons, a typed number) without reporting them back.
  useEffect(() => {
    if (userDriven.current) return;
    const i = indexOfValue(scale, value);
    if (i === (target.current ?? index.current)) return;
    target.current = i;
    animateTo(i * TICK, reduceMotion ? 0 : 180, () => {
      target.current = null;
    });
  }, [value, scale, animateTo, reduceMotion]);

  useEffect(
    () => () => {
      stop();
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    },
    [stop],
  );

  // A horizontal trackpad swipe or shift + wheel slides the strip. Vertical wheel scrolls the page as usual.
  // This listener can't be React's, which is passive and so can't stop the browser's back-swipe.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!sideways && !e.shiftKey) return;
      e.preventDefault();
      stop();
      target.current = null;
      userDriven.current = true;
      setOffset(offset.current + (sideways ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1));
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(snap, 110);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setOffset, snap, stop, width]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stop();
    target.current = null;
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    drag.current = { id: e.pointerId, startX: e.clientX, startOffset: offset.current, samples: [{ t: e.timeStamp, x: e.clientX }] };
    userDriven.current = true;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(d.startOffset - (e.clientX - d.startX));
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    if (d.samples.length > 8) d.samples.shift();
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.style.cursor = 'grab';
    // Pointer moving left slides the strip right, so the offset grows as the pointer's x shrinks.
    const velocity = -releaseVelocity(d.samples, e.timeStamp);
    if (!reduceMotion && Math.abs(velocity) > 0.08) startGlide(velocity);
    else snap();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = indexForKey(e.key, target.current ?? index.current, count, majorEvery);
    if (next == null) return;
    e.preventDefault();
    stop();
    target.current = next;
    // Report as the strip crosses each tick, like any other movement.
    userDriven.current = true;
    animateTo(next * TICK, reduceMotion ? 0 : 110, () => {
      target.current = null;
      userDriven.current = false;
    });
  };

  if (width <= 0) return <div style={{ height: HEIGHT }} />;

  const half = Math.ceil(width / 2 / TICK) + 22;
  const ticks = [];
  for (let i = Math.max(0, center - half); i <= Math.min(count - 1, center + half); i++) {
    const v = min + i * step;
    const major = Math.round(v / step) % majorEvery === 0;
    ticks.push(<Tick key={i} index={i} major={major} label={major ? (format ? format(v) : String(Math.round(v))) : undefined} color={colors.textSecondary} labelColor={colors.textTertiary} />);
  }

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format ? format(value) : String(Math.round(value * 10) / 10)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onFocus={(e) => setRing(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setRing(false)}
      style={{
        position: 'relative',
        height: HEIGHT,
        width,
        cursor: 'grab',
        outline: 'none',
        borderRadius: 12,
        boxShadow: ring ? `0 0 0 2px ${colors.accent}` : 'none',
        // Horizontal drags are ours; vertical ones still scroll the page.
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          ref={trackRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: HEIGHT,
            width: count * TICK,
            transform: `translate3d(${width / 2 - TICK / 2 - offset.current}px, 0, 0)`,
            willChange: 'transform',
          }}
        >
          {ticks}
        </div>
      </div>
      <div style={{ position: 'absolute', top: -6, left: width / 2 - 1.5, width: 3, height: 46, borderRadius: 1.5, background: colors.accent, pointerEvents: 'none' }} />
    </div>
  );
}
