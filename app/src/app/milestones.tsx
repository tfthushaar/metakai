import { Image, StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { dateKey, formatLong, formatShort } from '../lib/dates';
import { GOALS } from '../lib/goals';
import { timeMilestones, type WeightMilestone } from '../lib/milestones';
import { useMilestones } from '../core/goals/useMilestones';
import { displayWeight, weightUnit } from '../lib/units';
import { listPhotos, photoAvailable } from '../modules/body/repo';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

function MilestoneCard({ m, previousKg, index, photoUri, locked }: { m: WeightMilestone; previousKg: number; index: number; photoUri: string | null; locked: boolean }) {
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const wu = weightUnit(units);
  const reached = m.reachedDate != null;
  const label = m.isGoal ? 'GOAL' : m.isHalfway ? `MILESTONE ${index + 1} · HALFWAY` : `MILESTONE ${index + 1}`;

  return (
    <Card index={index} style={[styles.card, reached && { borderColor: colors.accent, borderWidth: 1.5 }, locked && { opacity: 0.55 }]} padded={false}>
      {reached && photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />}
      <View style={{ padding: SPACE.lg, gap: SPACE.sm }}>
        <View style={styles.headerRow}>
          <Text variant="caption" weight="bold" tone={reached ? 'accent' : 'secondary'} style={{ letterSpacing: 0.6 }}>
            {label}
          </Text>
          <Icon name={reached ? 'trophy' : locked ? 'flag' : 'target'} size={18} color={reached ? colors.accent : colors.textTertiary} />
        </View>
        <Text variant="title1" tabular>{`${displayWeight(m.targetKg, units)} ${wu}`}</Text>
        <Text variant="subhead" tone="secondary" tabular>
          {`${m.deltaKg < 0 ? '−' : '+'}${displayWeight(Math.abs(m.deltaKg), units)} ${wu} from ${displayWeight(previousKg, units)}`}
        </Text>
        <View style={[styles.footer, { borderTopColor: colors.separator }]}>
          {reached ? (
            <Text variant="subhead" weight="semibold">
              {`Reached ${formatLong(m.reachedDate!)}${m.daysTaken != null ? ` · ${m.daysTaken} days` : ''}`}
            </Text>
          ) : (
            <Text variant="subhead" tone="secondary">
              {m.predictedDate ? `Predicted ${formatLong(m.predictedDate)}` : 'Keep logging to predict a date'}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

export default function Milestones() {
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const { phase } = useBody();
  const milestones = useMilestones();
  const photos = useQuery(['progress_photos'], listPhotos);

  const photoNear = (date: string) => {
    const candidates = photos.filter((p) => p.pose === 'front' && photoAvailable(p) && p.dateKey <= date);
    return candidates[0]?.localPath ?? null;
  };

  if (!phase) {
    return (
      <Screen title="Milestones" back>
        <Text tone="secondary">Set a goal to generate milestones.</Text>
      </Screen>
    );
  }

  if (!milestones) {
    const today = dateKey();
    return (
      <Screen title="Milestones" subtitle={GOALS[phase.goalType].title} back>
        <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
          On a {GOALS[phase.goalType].title.toLowerCase()} the scale isn’t the scorecard. These checkpoints are for your measurements and photos.
        </Text>
        {timeMilestones(phase.startDate, today).map((t, i) => (
          <Card key={t.weeks} index={i} style={{ marginBottom: SPACE.md, opacity: t.reached ? 1 : 0.6 }}>
            <View style={styles.headerRow}>
              <Text variant="title3">{`Week ${t.weeks}`}</Text>
              <Icon name={t.reached ? 'trophy' : 'flag'} size={18} color={t.reached ? colors.accent : colors.textTertiary} />
            </View>
            <Text variant="subhead" tone="secondary">
              {t.reached ? `Reached ${formatShort(t.date)} · take photos and measurements` : `Check in on ${formatLong(t.date)}`}
            </Text>
          </Card>
        ))}
      </Screen>
    );
  }

  const nextIndex = milestones.findIndex((m) => !m.reachedDate);
  return (
    <Screen title="Milestones" subtitle={`${GOALS[phase.goalType].title} · ${displayWeight(phase.startKg, units)} → ${displayWeight(phase.targetKg!, units)} ${weightUnit(units)}`} back>
      <View style={{ gap: SPACE.md }}>
        {milestones.map((m, i) => (
          <MilestoneCard
            key={m.index}
            m={m}
            index={i}
            previousKg={i === 0 ? phase.startKg : milestones[i - 1].targetKg}
            photoUri={m.reachedDate ? photoNear(m.reachedDate) : null}
            locked={nextIndex >= 0 && i > nextIndex}
          />
        ))}
      </View>
      <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: SPACE.xl }}>
        Milestones use your trend weight, so a single light weigh-in won’t unlock one early.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, overflow: 'hidden' },
  photo: { width: '100%', height: 220 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.sm, marginTop: SPACE.xs },
});
