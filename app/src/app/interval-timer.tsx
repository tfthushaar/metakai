import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useBody } from '../core/goals/useBody';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { cardioCalories } from '../lib/cardio';
import { dateKey } from '../lib/dates';
import { buildSegments, formatClock, INTERVAL_PRESETS, positionAt, totalSeconds, type IntervalConfig, type IntervalMode, type SegmentKind } from '../lib/intervals';
import { addCardio } from '../modules/cardio/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Stepper } from '../ui/Stepper';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const PHASE_LABEL: Record<SegmentKind, string> = { warmup: 'Warm up', work: 'Work', rest: 'Rest', cooldown: 'Cool down' };
const MODES: IntervalMode[] = ['tabata', 'hiit', 'emom', 'custom'];
const EFFORT = [
  { rpe: 5, label: 'Moderate' },
  { rpe: 7, label: 'Hard' },
  { rpe: 9, label: 'All out' },
];

type Phase = 'setup' | 'running' | 'done';

function CountdownRing({ size, progress, color, track, children }: { size: number; progress: number; color: string; track: string; children: React.ReactNode }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * Math.min(1, Math.max(0, progress))}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

function Row({ label, value, onChange, step, min, max, unit = 's' }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number; unit?: string }) {
  const { colors } = useTheme();
  const show = (v: number) => (unit === 's' ? (v >= 60 && v % 60 === 0 ? `${v / 60} min` : v >= 60 ? formatClock(v) : `${v} s`) : `${v}`);
  return (
    <View style={[styles.stepRow, { backgroundColor: colors.surface }]}>
      <Stepper label={label} value={value} onChange={onChange} step={step} min={min} max={max} format={show} unit={unit === 's' ? 'seconds' : unit} />
    </View>
  );
}

function Running({ config, onFinish }: { config: IntervalConfig; onFinish: (elapsedSec: number) => void }) {
  useKeepAwake();
  const { colors } = useTheme();
  const vibrate = useSettings((s) => s.haptics);
  const segments = useMemo(() => buildSegments(config), [config]);
  const total = totalSeconds(segments);
  const startedAt = useRef(Date.now());
  const pausedMs = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const lastIndex = useRef(-1);
  const lastSecond = useRef(-1);

  const elapsed = () => ((pausedAt.current ?? Date.now()) - startedAt.current - pausedMs.current) / 1000;
  const pos = positionAt(segments, elapsed());

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (pos.done) {
      if (vibrate) Vibration.vibrate([0, 300, 150, 300, 150, 600]);
      onFinish(total);
      return;
    }
    if (pos.index !== lastIndex.current) {
      if (lastIndex.current !== -1 && vibrate) Vibration.vibrate(pos.segment?.kind === 'work' ? [0, 450] : [0, 200, 100, 200]);
      lastIndex.current = pos.index;
    }
    const sec = Math.ceil(pos.remaining);
    if (sec !== lastSecond.current) {
      lastSecond.current = sec;
      if (sec <= 3 && sec > 0) haptic.medium();
    }
  });

  const togglePause = () => {
    if (paused) {
      pausedMs.current += Date.now() - (pausedAt.current ?? Date.now());
      pausedAt.current = null;
    } else {
      pausedAt.current = Date.now();
    }
    haptic.selection();
    setPaused(!paused);
  };

  const seg = pos.segment;
  const next = segments[pos.index + 1];
  const isWork = seg?.kind === 'work';
  const tint = isWork ? colors.accent : seg?.kind === 'rest' ? colors.success : colors.text;
  const rounds = config.rounds;

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.running}>
      <Text variant="title1" weight="bold" color={tint} style={{ letterSpacing: 1 }}>
        {seg ? PHASE_LABEL[seg.kind].toUpperCase() : ''}
      </Text>
      <Text variant="headline" tone="secondary" style={{ marginBottom: SPACE.xl }}>
        {seg && seg.round > 0 ? `Round ${seg.round} of ${rounds}` : ' '}
      </Text>

      <CountdownRing size={280} progress={seg ? 1 - pos.remaining / seg.seconds : 1} color={tint} track={colors.fill}>
        <Text variant="display" tabular style={{ fontSize: 76, lineHeight: 84 }}>
          {formatClock(pos.remaining)}
        </Text>
        <Text variant="subhead" tone="secondary" tabular>{`${formatClock(total - elapsed())} left`}</Text>
      </CountdownRing>

      <Text variant="subhead" tone="tertiary" style={{ marginTop: SPACE.xl }}>
        {next ? `Next: ${PHASE_LABEL[next.kind]} · ${formatClock(next.seconds)}` : 'Last one'}
      </Text>

      <View style={styles.controls}>
        <PressableScale feedback="medium" onPress={() => onFinish(elapsed())} style={[styles.control, { backgroundColor: colors.fill }]}>
          <Icon name="close" size={26} color={colors.text} />
        </PressableScale>
        <PressableScale feedback="none" onPress={togglePause} style={[styles.controlMain, { backgroundColor: colors.accent }]}>
          <Icon name={paused ? 'play' : 'pause'} size={34} color={colors.onAccent} fill={colors.onAccent} />
        </PressableScale>
        <View style={styles.control} />
      </View>
    </Animated.View>
  );
}

export default function IntervalTimer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentKg } = useBody();
  const [mode, setMode] = useState<IntervalMode>('tabata');
  const [config, setConfig] = useState<IntervalConfig>(INTERVAL_PRESETS.tabata.config);
  const [phase, setPhase] = useState<Phase>('setup');
  const [elapsed, setElapsed] = useState(0);
  const [rpe, setRpe] = useState(7);

  const total = totalSeconds(buildSegments(config));
  const set = (patch: Partial<IntervalConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setMode('custom');
  };

  useEffect(() => {
    if (phase !== 'running') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [phase]);

  const minutes = Math.round((elapsed / 60) * 10) / 10;
  const kcal = cardioCalories({ kind: 'hiit', durationMin: minutes, rpe, bodyweightKg: currentKg ?? 75 });

  const save = () => {
    addCardio({
      dateKey: dateKey(),
      kind: 'hiit',
      durationMin: minutes,
      distanceKm: null,
      avgHr: null,
      rpe,
      kcal,
      intervals: { ...config, name: INTERVAL_PRESETS[mode].name },
      note: null,
    });
    haptic.success();
    toast(`Saved · ≈${kcal} kcal`);
    router.back();
  };

  if (phase === 'running') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Running
          config={config}
          onFinish={(sec) => {
            setElapsed(sec);
            setPhase('done');
          }}
        />
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: SPACE.lg, paddingTop: insets.top + SPACE.xxl, paddingBottom: insets.bottom + SPACE.lg }}>
        <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1, gap: SPACE.md }}>
          <Text variant="largeTitle">{elapsed >= total - 1 ? 'Done' : 'Stopped'}</Text>
          <View style={styles.summary}>
            <View style={[styles.summaryCell, { backgroundColor: colors.surface }]}>
              <Text variant="footnote" tone="secondary">
                Time
              </Text>
              <Text variant="title2" tabular>
                {formatClock(elapsed)}
              </Text>
            </View>
            <View style={[styles.summaryCell, { backgroundColor: colors.surface }]}>
              <Text variant="footnote" tone="secondary">
                Burned
              </Text>
              <Text variant="title2" tabular>{`≈ ${kcal} kcal`}</Text>
            </View>
          </View>
          <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md, paddingHorizontal: 4 }}>
            HOW HARD WAS IT?
          </Text>
          <View style={styles.chips}>
            {EFFORT.map((e) => (
              <Chip key={e.rpe} label={e.label} selected={rpe === e.rpe} onPress={() => setRpe(e.rpe)} />
            ))}
          </View>
        </Animated.View>
        <View style={{ gap: SPACE.sm }}>
          <Button title="Save to cardio" onPress={save} disabled={elapsed < 30} />
          <Button title="Discard" variant="plain" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: 160, gap: SPACE.md }}>
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Interval timer</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>

        <View style={styles.chips}>
          {MODES.map((m) => (
            <Chip
              key={m}
              label={INTERVAL_PRESETS[m].name}
              selected={mode === m}
              onPress={() => {
                setMode(m);
                if (m !== 'custom') setConfig(INTERVAL_PRESETS[m].config);
              }}
            />
          ))}
        </View>
        <Text variant="subhead" tone="secondary">
          {INTERVAL_PRESETS[mode].description}
        </Text>

        <Row label={mode === 'emom' ? 'Each minute' : 'Work'} value={config.workSec} onChange={(v) => set({ workSec: v })} step={mode === 'emom' ? 15 : 5} min={5} max={600} />
        {mode !== 'emom' && <Row label="Rest" value={config.restSec} onChange={(v) => set({ restSec: v })} step={5} min={0} max={600} />}
        <Row label="Rounds" value={config.rounds} onChange={(v) => set({ rounds: v })} step={1} min={1} max={50} unit="" />
        <Row label="Warm-up" value={config.warmupSec} onChange={(v) => set({ warmupSec: v })} step={30} min={0} max={900} />
        <Row label="Cool-down" value={config.cooldownSec} onChange={(v) => set({ cooldownSec: v })} step={30} min={0} max={900} />

        <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: 4 }}>
          The screen stays on while the timer runs. Your phone vibrates at each change and counts down the last three seconds.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        <View style={styles.totalsRow}>
          <Text variant="subhead" tone="secondary">
            Total
          </Text>
          <Text variant="title3" tabular>
            {formatClock(total)}
          </Text>
        </View>
        <Button
          title="Start"
          icon="play"
          onPress={() => {
            haptic.medium();
            setPhase('running');
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, paddingLeft: SPACE.lg, borderRadius: RADIUS.lg },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  running: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg },
  controls: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxl, marginTop: SPACE.xxxl },
  control: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  controlMain: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  summaryCell: { flex: 1, padding: SPACE.lg, borderRadius: RADIUS.lg, gap: 4 },
});
