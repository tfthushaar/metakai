import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { formatShort } from '../lib/dates';
import { COHORTS, compareLift, KEY_LIFTS, RANK_GROUP_LABEL, type Cohort, type GroupRank } from '../lib/ranks';
import { displayWeight, weightUnit } from '../lib/units';
import { RadarChart, ScoreBar, StatPill, TierBadge, TierLadder } from '../modules/ranks/components';
import { currentPhysiqueRank } from '../modules/ranks/repo';
import { leaderboardsAvailable } from '../modules/leaderboards/api';
import { usePerson } from '../modules/ranks/usePerson';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets', 'weight_entries', 'profile'] as const;

/** Lifts that would rank a group, for groups with nothing logged yet. */
function suggestions(group: GroupRank['group']): string {
  return Object.values(KEY_LIFTS)
    .filter((l) => (l.groups[group] ?? 0) >= 0.9)
    .slice(0, 3)
    .map((l) => l.name)
    .join(', ');
}

const pct = (p: number) => (p >= 99.5 ? 'Top 1%' : p >= 50 ? `Top ${Math.max(1, Math.round(100 - p))}%` : `Stronger than ${Math.round(p)}%`);

export default function RankPhysique() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const units = useSettings((s) => s.units);
  const person = usePerson();
  const rank = useQuery([...TABLES], () => (person ? currentPhysiqueRank(person) : null), [person?.weightKg, person?.age, person?.heightCm, person?.sex]);
  const [cohort, setCohort] = useState<Cohort>('similar');
  const [open, setOpen] = useState<string | null>(null);

  if (!person || !rank) {
    return (
      <Screen title="Physique pass" back>
        <Card>
          <Text variant="headline">Almost there</Text>
          <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
            Add your profile and a weigh-in so your lifts can be compared fairly for your sex, age and size.
          </Text>
          <View style={{ marginTop: SPACE.md }}>
            <Button title="Log weight" size="md" onPress={() => router.push('/log-weight')} />
          </View>
        </Card>
      </Screen>
    );
  }

  const sexWord = person.sex === 'male' ? 'men' : 'women';
  const cohortText: Record<Cohort, string> = {
    similar: `${sexWord} your age and size`,
    weight: `${sexWord} at ${displayWeight(person.weightKg, units, 0)} ${weightUnit(units)}`,
    height: `${sexWord} of your height`,
    sex: sexWord,
    everyone: 'all adults',
  };
  const compare = (g: GroupRank) => (g.best ? compareLift(g.best.exerciseId, g.best.oneRmKg, person, cohort) : null);

  return (
    <Screen
      title="Physique pass"
      back
      accessory={
        rank.rankedCount > 0 ? (
          <PressableScale
            feedback="selection"
            onPress={() => router.push({ pathname: '/share-card', params: { kind: 'physique' } })}
            style={[styles.round, { backgroundColor: colors.fill }]}
          >
            <Icon name="share" size={17} color={colors.text} />
          </PressableScale>
        ) : undefined
      }
    >
      <Card index={0}>
        <View style={styles.hero}>
          <TierBadge tier={rank.tier} size={92} locked={rank.rankedCount === 0} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="footnote" tone="secondary">
              OVERALL
            </Text>
            <Text variant="title1">{rank.rankedCount ? rank.tier.label : 'Unranked'}</Text>
            <Text variant="subhead" tone="secondary">
              {rank.rankedCount
                ? rank.tier.nextLabel
                  ? `${rank.tier.toNext} points to ${rank.tier.nextLabel}`
                  : 'Top tier. Keep it up.'
                : 'Log a key lift to get your first rank.'}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: SPACE.lg }}>
          <TierLadder tier={rank.tier} />
        </View>
        {rank.strongest && (
          <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md }}>
            {`Strongest: ${RANK_GROUP_LABEL[rank.strongest.group]} (${rank.strongest.tier.label}).`}
            {rank.weakest ? ` Biggest gap: ${RANK_GROUP_LABEL[rank.weakest.group]} (${rank.weakest.tier.label}).` : ''}
            {rank.rankedCount < 10 ? ` ${10 - rank.rankedCount} groups unranked pull your overall down.` : ''}
          </Text>
        )}
      </Card>

      <Card index={1} style={{ marginTop: SPACE.md, alignItems: 'center' }}>
        <RadarChart
          size={Math.min(width - SPACE.lg * 4, 320)}
          values={rank.groups.map((g) => ({ label: RANK_GROUP_LABEL[g.group], value: g.score, color: g.best ? g.tier.color : colors.fill }))}
        />
      </Card>

      {leaderboardsAvailable && (
        <View style={{ marginTop: SPACE.md }}>
          <Button title="Leaderboard" icon="trophy" variant="gray" onPress={() => router.push({ pathname: '/leaderboard', params: { board: 'physique' } })} />
        </View>
      )}

      <SectionHeader title="Compare with" />
      <View style={styles.chips}>
        {COHORTS.map((c) => (
          <Chip key={c.id} label={c.label} selected={cohort === c.id} onPress={() => setCohort(c.id)} />
        ))}
      </View>
      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: 4 }}>
        {`Against the average untrained ${cohortText[cohort]}. Tiers always adjust for your sex, age and size.`}
      </Text>

      <SectionHeader title="Muscle groups" />
      <Card index={2} padded={false}>
        {rank.groups.map((g, i) => {
          const c = compare(g);
          const expanded = open === g.group;
          return (
            <Animated.View key={g.group} layout={layout} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}>
              <PressableScale scaleTo={0.99} onPress={() => setOpen(expanded ? null : g.group)} style={styles.row}>
                <TierBadge tier={g.tier} size={40} locked={!g.best} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowHead}>
                    <Text variant="headline">{RANK_GROUP_LABEL[g.group]}</Text>
                    <Text variant="subhead" weight="semibold" color={g.best ? g.tier.color : colors.textTertiary}>
                      {g.best ? g.tier.label : 'Unranked'}
                    </Text>
                  </View>
                  <ScoreBar value={g.score} color={g.best ? g.tier.color : colors.textTertiary} />
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {c ? `${pct(c.percentile)} · ${c.multiple.toFixed(1)}× average` : 'No key lift logged yet'}
                  </Text>
                </View>
                <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} color={colors.textTertiary} />
              </PressableScale>
              {expanded && (
                <Animated.View entering={FadeIn.duration(180)} style={styles.detail}>
                  <View style={styles.pills}>
                    <StatPill label="Score" value={`${Math.round(g.score)}`} />
                    <StatPill label="Strength" value={`${Math.round(g.strengthPoints)}`} />
                    <StatPill label="Weeks trained" value={`${Math.round(g.consistency * 12)}/12`} />
                  </View>
                  {g.lifts.length === 0 ? (
                    <Text
                      variant="footnote"
                      tone="secondary"
                    >{`Log one of these to rank ${RANK_GROUP_LABEL[g.group].toLowerCase()}: ${suggestions(g.group)}.`}</Text>
                  ) : (
                    g.lifts.map((l) => {
                      const lc = compareLift(l.exerciseId, l.oneRmKg, person, cohort)!;
                      return (
                        <PressableScale
                          key={l.exerciseId}
                          scaleTo={0.99}
                          onPress={() => router.push({ pathname: '/exercise', params: { id: l.exerciseId } })}
                          style={styles.lift}
                        >
                          <View style={{ flex: 1 }}>
                            <Text variant="subhead">{KEY_LIFTS[l.exerciseId].name}</Text>
                            <Text
                              variant="caption"
                              tone="tertiary"
                            >{`Best ${formatShort(l.dateKey)} · average ${displayWeight(lc.expectedKg, units, 0)} ${weightUnit(units)}`}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text variant="subhead" weight="semibold" tabular>{`${displayWeight(l.oneRmKg, units, 1)} ${weightUnit(units)}`}</Text>
                            <Text variant="caption" tone="secondary" tabular>{`${lc.multiple.toFixed(2)}× · ${pct(lc.percentile)}`}</Text>
                          </View>
                        </PressableScale>
                      );
                    })
                  )}
                  {g.best && g.tier.nextLabel && (
                    <Text
                      variant="footnote"
                      tone="secondary"
                    >{`${g.tier.toNext} points to ${g.tier.nextLabel}. Add weight to your best lift or train ${RANK_GROUP_LABEL[g.group].toLowerCase()} more weeks in a row.`}</Text>
                  )}
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
      </Card>

      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
        Scores combine your best estimated 1-rep max on key lifts from the last 6 months (80%) with how many of the last 12 weeks you trained the group (20%).
        Averages come from published strength standards, adjusted for sex, age, weight and height. Estimates only.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
  detail: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.md },
  pills: { flexDirection: 'row', gap: SPACE.sm },
  lift: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 4, borderRadius: RADIUS.sm },
});
