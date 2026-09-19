import { Alert, StyleSheet, View } from 'react-native';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { dateKey, parseDateKey } from '../lib/dates';
import { muscleRecovery } from '../lib/muscleRecovery';
import type { CheckInAnswers } from '../lib/readiness';
import { deleteCheckIn, EMPTY_ANSWERS, getCheckIn, readinessFor, readinessHistory, recentTraining, saveCheckIn } from '../modules/recovery/repo';
import { watchSleep } from '../modules/wearables/repo';
import { Card, SectionHeader } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Ring } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { Stepper } from '../ui/Stepper';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

type ScaleKey = Exclude<keyof CheckInAnswers, 'sleepHours'>;

const QUESTIONS: { key: ScaleKey; label: string; low: string; high: string }[] = [
  { key: 'sleepQuality', label: 'Sleep quality', low: 'Poor', high: 'Great' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Very sore' },
  { key: 'stress', label: 'Stress', low: 'Low', high: 'High' },
  { key: 'energy', label: 'Energy', low: 'Low', high: 'High' },
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Great' },
];

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ago(ms: number): string {
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function Scale({ value, onChange, low, high }: { value: number | null; onChange: (v: number) => void; low: string; high: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.scale}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <PressableScale
              key={n}
              feedback="selection"
              scaleTo={0.9}
              onPress={() => onChange(n)}
              style={[styles.dot, { backgroundColor: on ? colors.accent : colors.fill }]}
              accessibilityLabel={`${n} of 5`}
            >
              <Text variant="subhead" weight="semibold" color={on ? colors.onAccent : colors.textSecondary}>
                {n}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <View style={styles.scaleEnds}>
        <Text variant="caption" tone="tertiary">
          {low}
        </Text>
        <Text variant="caption" tone="tertiary">
          {high}
        </Text>
      </View>
    </View>
  );
}

export default function Recovery() {
  const { colors } = useTheme();
  const today = dateKey();
  const answers = useQuery(['recovery_checkins'], () => getCheckIn(today) ?? EMPTY_ANSWERS, [today]);
  const result = useQuery(['recovery_checkins', 'workout_sets', 'workouts', 'health_markers'], () => readinessFor(today), [today]);
  const fromWatch = useQuery(['health_markers'], () => watchSleep(today), [today]);
  const history = useQuery(['recovery_checkins', 'workout_sets', 'workouts'], () => readinessHistory(14, today), [today]);
  const training = useQuery(['workouts', 'workout_exercises', 'workout_sets'], recentTraining);
  const muscles = muscleRecovery(training, Date.now())
    .filter((m) => m.lastTrainedAt != null || m.recovered < 100)
    .sort((a, b) => a.recovered - b.recovered);

  const update = (patch: Partial<CheckInAnswers>) => saveCheckIn(today, { ...answers, ...patch });

  const bandColor = !result ? colors.textTertiary : result.band === 'high' ? colors.success : result.band === 'moderate' ? colors.warning : colors.danger;
  const bandLabel = !result ? 'Check in below' : result.band === 'high' ? 'Ready to push' : result.band === 'moderate' ? 'Train smart' : 'Take it easy';
  const sleep = answers.sleepHours ?? fromWatch;

  return (
    <Screen title="Recovery" back>
      <Card index={0}>
        <View style={styles.hero}>
          <Ring size={112} stroke={11} progress={(result?.score ?? 0) / 100} color={bandColor}>
            <Text variant="title1" tabular>
              {result ? result.score : '—'}
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="footnote" tone="secondary">
              READINESS
            </Text>
            <Text variant="title3" color={result ? bandColor : colors.text}>
              {bandLabel}
            </Text>
            <Text variant="subhead" tone="secondary">
              {result ? result.advice : 'Answer a few quick questions each morning to see how ready you are to train.'}
            </Text>
          </View>
        </View>
        {result && result.flags.length > 0 && (
          <View style={styles.flags}>
            {result.flags.map((f) => (
              <View key={f} style={[styles.flag, { backgroundColor: colors.fill }]}>
                <Text variant="caption" weight="medium">
                  {f}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Today’s check-in" />
      <Card index={1} style={{ gap: SPACE.lg }}>
        <View style={styles.sleepRow}>
          <Icon name="moon" size={20} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="body">Sleep</Text>
            {answers.sleepHours == null && fromWatch != null && (
              <Text variant="caption" tone="secondary">
                From your watch
              </Text>
            )}
          </View>
          <Stepper
            value={sleep ?? 7.5}
            onChange={(sleepHours) => update({ sleepHours })}
            step={0.5}
            min={0}
            max={16}
            decimals={1}
            unit="h"
            title="Sleep"
            format={(v) => (sleep == null ? '—' : `${v} h`)}
            valueWidth={56}
          />
        </View>
        {QUESTIONS.map((q) => (
          <View key={q.key} style={{ gap: SPACE.sm }}>
            <Text variant="body">{q.label}</Text>
            <Scale value={answers[q.key]} onChange={(v) => update({ [q.key]: v })} low={q.low} high={q.high} />
          </View>
        ))}
        <Text variant="caption" tone="tertiary">
          Saved as you tap. Recent training load is included automatically.
        </Text>
        {result && (
          <Button
            title="Clear today’s check-in"
            variant="destructive"
            size="md"
            onPress={() =>
              Alert.alert('Clear check-in?', 'Today’s answers are removed. Your readiness score goes back to training load only.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    deleteCheckIn(today);
                    haptic.medium();
                    toast('Check-in cleared');
                  },
                },
              ])
            }
          />
        )}
      </Card>

      <SectionHeader title="Last 14 days" />
      <Card index={2}>
        <View style={styles.chart}>
          {history.map((h) => {
            const c = h.score == null ? colors.fill : h.score >= 75 ? colors.success : h.score >= 50 ? colors.warning : colors.danger;
            return (
              <View key={h.dateKey} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={{ height: `${Math.max(6, h.score ?? 6)}%`, backgroundColor: c, borderRadius: 4 }} />
                </View>
                <Text variant="caption" tone={h.dateKey === today ? 'accent' : 'tertiary'}>
                  {DAY_LETTERS[parseDateKey(h.dateKey).getDay()]}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Muscle recovery" />
      <Card index={3} padded={false}>
        {muscles.length === 0 ? (
          <View style={{ padding: SPACE.lg }}>
            <Text variant="subhead" tone="secondary">
              Everything is fresh. Muscles you train show up here while they recover.
            </Text>
          </View>
        ) : (
          muscles.map((m, i) => {
            const c = m.recovered >= 80 ? colors.success : m.recovered >= 50 ? colors.warning : colors.danger;
            return (
              <View key={m.id} style={[styles.muscleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <View style={{ width: 104 }}>
                  <Text variant="body" numberOfLines={1} adjustsFontSizeToFit>
                    {m.label}
                  </Text>
                  {m.lastTrainedAt != null && (
                    <Text variant="caption" tone="tertiary">{ago(Date.now() - m.lastTrainedAt)}</Text>
                  )}
                </View>
                <View style={[styles.muscleTrack, { backgroundColor: colors.fill }]}>
                  <View style={{ width: `${m.recovered}%`, height: '100%', backgroundColor: c, borderRadius: RADIUS.pill }} />
                </View>
                <Text variant="subhead" weight="semibold" tabular style={{ width: 44, textAlign: 'right' }}>{`${m.recovered}%`}</Text>
              </View>
            );
          })
        )}
      </Card>
      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        An estimate from your recent sets. Most muscles are ready again after 48–72 hours.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACE.md },
  flag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  sleepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  scale: { flexDirection: 'row', gap: SPACE.sm },
  dot: { flex: 1, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  chart: { flexDirection: 'row', gap: 4, height: 110 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: 10 },
  muscleTrack: { flex: 1, height: 8, borderRadius: RADIUS.pill, overflow: 'hidden' },
});
