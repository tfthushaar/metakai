import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBody } from '../core/goals/useBody';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { durationLabel, simplify, type TrackKind } from '../lib/geo';
import { bestEfforts } from '../modules/cardio/repo';
import { BestEffortsList, distanceParts, elevationLabel, paceOrSpeed, RouteArt, SplitsList, StatCell } from '../modules/gps/components';
import { defaultTitle, hasBestEfforts, saveSummary, summarize, TRACK_KINDS, trackLabel, type Summary } from '../modules/gps/summary';
import { HeartRateBadge } from '../modules/wearables/components';
import { endHeartRateSession, startHeartRateSession } from '../modules/wearables/heartRate';
import { saveHeartRate } from '../modules/wearables/repo';
import {
  clearRecording,
  currentSecPerM,
  discardRecording,
  elapsedSec,
  ensurePermission,
  finishRecording,
  loadSegments,
  pauseRecording,
  resumeRecording,
  signalQuality,
  startRecording,
  useLive,
  watchSignal,
  type Readiness,
} from '../modules/gps/tracker';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';
import { Toggle } from '../ui/Toggle';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SignalPill() {
  const { colors } = useTheme();
  const acc = useLive((s) => s.fixAcc);
  const at = useLive((s) => s.fixAt);
  const now = useNow(2000);
  const q = signalQuality(acc, at, now);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = q === 'good' ? 1 : withRepeat(withTiming(0.3, { duration: 700 }), -1, true);
  }, [q, pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const color = q === 'good' ? colors.success : q === 'weak' ? colors.warning : colors.textTertiary;
  return (
    <View style={[styles.pill, { backgroundColor: colors.fill }]}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, dot]} />
      <Text variant="footnote" weight="medium">
        {q === 'good' ? `GPS ready · ±${Math.round(acc!)} m` : q === 'weak' ? `Weak GPS · ±${Math.round(acc!)} m` : 'Finding GPS…'}
      </Text>
    </View>
  );
}

/* ---------------- setup ---------------- */

function Setup({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const voice = useSettings((s) => s.gpsVoice);
  const set = useSettings((s) => s.set);
  const [kind, setKind] = useState<TrackKind>(useLive.getState().kind);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    ensurePermission().then(async (r) => {
      if (cancelled) return;
      setReady(r);
      if (r === 'ok') stop = await watchSignal().catch(() => null);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const start = async () => {
    setStarting(true);
    haptic.medium();
    try {
      await startRecording(kind);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start GPS.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={[styles.fill, { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.topRow}>
        <PressableScale onPress={onClose} hitSlop={10} style={[styles.round, { backgroundColor: colors.fill }]}>
          <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
        </PressableScale>
        {ready === 'ok' && <SignalPill />}
        <View style={styles.round} />
      </View>

      <View style={styles.center}>
        {ready === 'denied' || ready === 'services-off' ? (
          <View style={{ alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.xl }}>
            <Icon name="navigation" size={36} color={colors.textTertiary} />
            <Text variant="title3" align="center">
              {ready === 'denied' ? 'Location access is off' : 'Location is turned off'}
            </Text>
            <Text variant="subhead" tone="secondary" align="center">
              {ready === 'denied'
                ? 'Allow location while using the app to map your route. It stays on your phone.'
                : 'Turn on location in your phone’s quick settings, then come back.'}
            </Text>
            <Button title="Open settings" size="md" variant="gray" full={false} onPress={() => Linking.openSettings()} />
          </View>
        ) : (
          <PressableScale feedback="none" scaleTo={0.94} disabled={ready !== 'ok' || starting} onPress={start} style={[styles.startButton, { backgroundColor: colors.accent }]}>
            <Text variant="title2" weight="bold" color={colors.onAccent}>
              START
            </Text>
          </PressableScale>
        )}
      </View>

      <View style={{ gap: SPACE.lg, paddingHorizontal: SPACE.lg }}>
        <View style={[styles.kinds, { backgroundColor: colors.surface }]}>
          {TRACK_KINDS.map((k) => {
            const on = k.id === kind;
            return (
              <PressableScale key={k.id} feedback="selection" scaleTo={0.96} onPress={() => setKind(k.id)} style={[styles.kind, on && { backgroundColor: colors.text }]}>
                <Text variant="subhead" weight="semibold" color={on ? colors.background : colors.textSecondary}>
                  {k.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <View style={styles.voiceRow}>
          <Icon name="volume" size={18} color={colors.textSecondary} />
          <Text variant="subhead" tone="secondary" style={{ flex: 1 }}>
            Voice splits
          </Text>
          <Toggle value={voice} onChange={(v) => set({ gpsVoice: v })} />
        </View>
      </View>
    </View>
  );
}

/* ---------------- live ---------------- */

function Live({ onMinimize }: { onMinimize: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const metric = useSettings((s) => s.units) === 'metric';
  const live = useLive();
  const now = useNow();
  const paused = live.status === 'paused';
  const dist = distanceParts(live.distanceM, metric);
  const avg = paceOrSpeed(live.kind, live.movingSec, live.distanceM, metric);
  const cur = currentSecPerM(live, now);
  const current =
    live.kind === 'cycle'
      ? { value: cur ? ((1 / cur) * (metric ? 3.6 : 2.23694)).toFixed(1) : '0.0', label: 'Speed' }
      : { value: cur ? durationLabel(cur * (metric ? 1000 : 1609.344)) : '—', label: 'Pace' };

  // Redraw the route at most every few seconds, simplified, so long activities stay smooth.
  const [routeTick, setRouteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRouteTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);
  const routePoints = useMemo(() => {
    const pts = useLive.getState().route.map(([lat, lon]) => ({ lat, lon }));
    return simplify(pts, 2).map((p) => [p.lat, p.lon] as [number, number]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTick, live.route.length > 1]);

  const confirmFinish = () => {
    haptic.medium();
    finishRecording();
  };

  useEffect(() => {
    startHeartRateSession('gps');
  }, []);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.topRow}>
        <View style={styles.side}>
          <PressableScale onPress={onMinimize} hitSlop={10} style={[styles.round, { backgroundColor: colors.fill }]}>
            <Icon name="chevronDown" size={22} color={colors.textSecondary} />
          </PressableScale>
        </View>
        {paused ? (
          <View style={[styles.pill, { backgroundColor: colors.warning }]}>
            <Text variant="footnote" weight="bold" color="#000">
              PAUSED
            </Text>
          </View>
        ) : (
          <SignalPill />
        )}
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          <HeartRateBadge />
        </View>
      </View>

      <View style={{ alignItems: 'center', marginTop: SPACE.xl }}>
        <Text variant="footnote" tone="secondary" weight="semibold">
          {trackLabel(live.kind).toUpperCase()}
        </Text>
        <Text tabular numberOfLines={1} adjustsFontSizeToFit style={[styles.hero, { color: colors.text }]}>
          {dist.value}
        </Text>
        <Text variant="headline" tone="secondary" style={{ marginTop: -8 }}>
          {dist.unit === 'km' ? 'kilometres' : 'miles'}
        </Text>
      </View>

      <View style={[styles.liveStats, { borderColor: colors.separator }]}>
        <View style={styles.liveStat}>
          <Text variant="title2" tabular>
            {durationLabel(elapsedSec(live, now))}
          </Text>
          <Text variant="caption" tone="secondary">
            Time
          </Text>
        </View>
        <View style={[styles.liveDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.liveStat}>
          <Text variant="title2" tabular>
            {avg.value}
          </Text>
          <Text variant="caption" tone="secondary">{`${avg.label} ${avg.unit}`}</Text>
        </View>
        <View style={[styles.liveDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.liveStat}>
          <Text variant="title2" tabular>
            {current.value}
          </Text>
          <Text variant="caption" tone="secondary">
            {current.label}
          </Text>
        </View>
      </View>

      <View style={[styles.routeCard, { backgroundColor: colors.surface }]}>
        {routePoints.length > 1 ? (
          <RouteArt points={routePoints} width={width - SPACE.lg * 2} height={200} strokeWidth={3.5} />
        ) : (
          <Text variant="subhead" tone="tertiary">
            {paused ? 'Paused' : 'Your route appears as you move'}
          </Text>
        )}
        {live.gainM > 0 && (
          <Text variant="caption" tone="secondary" style={styles.elev}>{`↑ ${elevationLabel(live.gainM, metric)}`}</Text>
        )}
      </View>

      <View style={styles.controls}>
        {paused ? (
          <>
            <View style={styles.controlCol}>
              <PressableScale feedback="medium" onPress={() => resumeRecording()} style={[styles.control, { backgroundColor: colors.accent }]}>
                <Icon name="play" size={30} color={colors.onAccent} fill={colors.onAccent} />
              </PressableScale>
              <Text variant="footnote" tone="secondary">
                Resume
              </Text>
            </View>
            <View style={styles.controlCol}>
              <PressableScale feedback="none" onPress={confirmFinish} style={[styles.control, { backgroundColor: colors.text }]}>
                <Icon name="square" size={26} color={colors.background} fill={colors.background} />
              </PressableScale>
              <Text variant="footnote" tone="secondary">
                Finish
              </Text>
            </View>
          </>
        ) : (
          <PressableScale
            feedback="medium"
            onPress={() => pauseRecording()}
            style={[styles.control, styles.controlBig, { backgroundColor: colors.accent }]}
            accessibilityLabel="Pause"
          >
            <Icon name="pause" size={36} color={colors.onAccent} fill={colors.onAccent} />
          </PressableScale>
        )}
      </View>
    </View>
  );
}

/* ---------------- review ---------------- */

function Review({ onDone }: { onDone: (id: string | null) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const metric = useSettings((s) => s.units) === 'metric';
  const { currentKg } = useBody();
  const live = useLive();
  const summary = useMemo<Summary>(() => summarize(loadSegments(), live.kind, elapsedSec(live), metric, currentKg ?? 75), [live.kind, metric, currentKg]); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => bestEfforts(live.kind), [live.kind]);
  const [title, setTitle] = useState(defaultTitle(live.kind, new Date(live.startedAt)));
  const dist = distanceParts(summary.distanceM, metric);
  const avg = paceOrSpeed(summary.kind, summary.movingSec, summary.distanceM, metric);
  const tooShort = summary.distanceM < 50 || summary.points.length < 2;
  const cardW = width - SPACE.lg * 2;

  const save = () => {
    const id = saveSummary(summary, title, live.startedAt);
    const heart = endHeartRateSession('gps');
    if (heart) saveHeartRate('cardio_sessions', id, heart);
    clearRecording();
    haptic.success();
    onDone(id);
  };

  const discard = () =>
    Alert.alert('Discard this activity?', 'The route and stats will be deleted.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardRecording();
          endHeartRateSession('gps');
          onDone(null);
        },
      },
    ]);

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.lg, paddingBottom: 170, gap: SPACE.md }}>
        <Animated.View entering={FadeIn.duration(300)} style={{ gap: SPACE.md }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            selectionColor={colors.accent}
            style={[TYPE.largeTitle, { color: colors.text, padding: 0 }]}
            maxLength={60}
          />
          <View style={[styles.reviewRoute, { backgroundColor: colors.surface }]}>
            {tooShort ? (
              <Text variant="subhead" tone="tertiary">
                Not enough GPS data for a route
              </Text>
            ) : (
              <RouteArt points={summary.points} width={cardW} height={260} strokeWidth={4} />
            )}
          </View>

          <View style={[styles.grid, { backgroundColor: colors.surface }]}>
            <StatCell label="Distance" value={dist.value} unit={dist.unit} big />
            <StatCell label="Moving time" value={durationLabel(summary.movingSec)} big />
            <StatCell label={avg.label} value={avg.value} unit={avg.unit} big />
            <StatCell label="Elevation" value={elevationLabel(summary.elevationGainM, metric)} />
            <StatCell label="Calories" value={`≈ ${summary.kcal}`} />
            <StatCell label="Elapsed" value={durationLabel(summary.elapsedSec)} />
          </View>

          {hasBestEfforts(summary.kind) && Object.keys(summary.splits.best).length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <Text variant="headline">Best efforts</Text>
              <BestEffortsList best={summary.splits.best} previous={previous} />
            </View>
          )}

          {summary.splits.splits.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <Text variant="headline" style={{ marginBottom: SPACE.sm }}>
                Splits
              </Text>
              <SplitsList data={summary.splits} kind={summary.kind} metric={metric} />
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        <Button title="Save" onPress={save} disabled={tooShort} />
        <Button title="Discard" variant="plain" onPress={discard} />
      </View>
    </View>
  );
}

export default function Record() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useLive((s) => s.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {status === 'idle' ? (
        <Setup onClose={() => router.back()} />
      ) : status === 'finished' ? (
        <Review
          onDone={(id) => {
            if (id) router.replace({ pathname: '/activity', params: { id } });
            else router.back();
          }}
        />
      ) : (
        <Live onMinimize={() => router.back()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  side: { width: 84 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 32, borderRadius: RADIUS.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startButton: { width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center' },
  kinds: { flexDirection: 'row', padding: 4, borderRadius: RADIUS.pill },
  kind: { flex: 1, height: 40, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.xs },
  hero: { fontFamily: TYPE.display.fontFamily, fontSize: 104, lineHeight: 116, letterSpacing: -4, fontVariant: ['tabular-nums'] },
  liveStats: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACE.lg, marginTop: SPACE.xl, paddingVertical: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  liveStat: { flex: 1, alignItems: 'center', gap: 2 },
  liveDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  routeCard: { flex: 1, marginHorizontal: SPACE.lg, marginTop: SPACE.lg, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  elev: { position: 'absolute', top: SPACE.md, right: SPACE.lg },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: SPACE.xxxl, marginTop: SPACE.xl },
  controlCol: { alignItems: 'center', gap: SPACE.sm },
  control: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  controlBig: { width: 92, height: 92, borderRadius: 46 },
  reviewRoute: { height: 260, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderRadius: RADIUS.xl },
  section: { padding: SPACE.lg, borderRadius: RADIUS.xl },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
