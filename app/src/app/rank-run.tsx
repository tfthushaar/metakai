import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useQuery } from '../core/db/useQuery';
import { useFeature, useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { formatShort } from '../lib/dates';
import { durationLabel } from '../lib/geo';
import { ageGradeLabel, RUN_DISTANCES } from '../lib/ranks';
import { ScoreBar, StatPill, TierBadge, TierLadder } from '../modules/ranks/components';
import { CONSISTENCY_WEEKS, currentRunRank } from '../modules/ranks/repo';
import { leaderboardsAvailable } from '../modules/leaderboards/api';
import { usePerson } from '../modules/ranks/usePerson';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const MI = 1609.344;

export default function RankRun() {
  const { colors } = useTheme();
  const router = useRouter();
  const metric = useSettings((s) => s.units) === 'metric';
  const gpsOn = useFeature('gps');
  const person = usePerson();
  const rank = useQuery(['cardio_sessions', 'profile'], () => (person ? currentRunRank(person) : null), [person?.age, person?.sex]);

  if (!person || !rank) {
    return (
      <Screen title="Run pass" back>
        <Card>
          <Text variant="subhead" tone="secondary">
            Add your profile to get age-graded run ranks.
          </Text>
        </Card>
      </Screen>
    );
  }

  const sexWord = person.sex === 'male' ? 'men' : 'women';
  const verifiedOnly = rank.distances.every((d) => d.effort.verified);

  return (
    <Screen
      title="Run pass"
      back
      accessory={
        rank.best ? (
          <PressableScale
            feedback="selection"
            onPress={() => router.push({ pathname: '/share-card', params: { kind: 'run' } })}
            style={[styles.round, { backgroundColor: colors.fill }]}
          >
            <Icon name="share" size={17} color={colors.text} />
          </PressableScale>
        ) : undefined
      }
    >
      <Card index={0}>
        <View style={styles.hero}>
          <TierBadge tier={rank.tier} size={92} locked={!rank.best} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="footnote" tone="secondary">
              OVERALL
            </Text>
            <Text variant="title1">{rank.best ? rank.tier.label : 'Unranked'}</Text>
            <Text variant="subhead" tone="secondary">
              {rank.best
                ? rank.tier.nextLabel
                  ? `${rank.tier.toNext} points to ${rank.tier.nextLabel}`
                  : 'Top tier. Keep it up.'
                : 'Record a run of 1 km or more with GPS to get ranked.'}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: SPACE.lg }}>
          <TierLadder tier={rank.tier} />
        </View>
        <View style={[styles.pills, { marginTop: SPACE.lg }]}>
          <StatPill label="Best age grade" value={rank.best ? `${rank.best.ageGrade.toFixed(1)}%` : '—'} />
          <StatPill label="Faster than peers" value={rank.best ? `${Math.round(rank.best.percentile)}%` : '—'} />
          <StatPill label={`Weeks run of ${CONSISTENCY_WEEKS}`} value={`${Math.round(rank.consistency * CONSISTENCY_WEEKS)}`} />
        </View>
        {!rank.best && gpsOn && (
          <View style={{ marginTop: SPACE.lg }}>
            <Button title="Record a run" icon="navigation" size="md" onPress={() => router.push('/record')} />
          </View>
        )}
      </Card>

      {leaderboardsAvailable && (
        <View style={{ marginTop: SPACE.md }}>
          <Button title="Leaderboard" icon="trophy" variant="gray" onPress={() => router.push({ pathname: '/leaderboard', params: { board: 'run' } })} />
        </View>
      )}

      <SectionHeader title="Distances" />
      <Card index={1} padded={false}>
        {RUN_DISTANCES.map((d, i) => {
          const r = rank.distances.find((x) => x.distance.id === d.id);
          const pace = r ? (r.effort.timeSec / d.meters) * (metric ? 1000 : MI) : null;
          return (
            <View key={d.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
              {r ? <TierBadge tier={r.tier} size={40} /> : <TierBadge tier={rank.tier} size={40} locked />}
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.rowHead}>
                  <Text variant="headline">{d.label}</Text>
                  <Text variant="headline" tabular>
                    {r ? durationLabel(r.effort.timeSec) : '—'}
                  </Text>
                </View>
                {r ? (
                  <>
                    <ScoreBar value={r.points} color={r.tier.color} />
                    <Text variant="caption" tone="secondary" numberOfLines={2}>
                      {`${r.tier.label} · ${r.ageGrade.toFixed(1)}% ${ageGradeLabel(r.ageGrade).toLowerCase()} · faster than ${Math.round(r.percentile)}% of ${sexWord} your age · ${durationLabel(pace!)} /${metric ? 'km' : 'mi'} · ${formatShort(r.effort.dateKey)}${r.effort.verified ? '' : ' · manual'}`}
                    </Text>
                  </>
                ) : (
                  <Text variant="caption" tone="tertiary">{`Run ${/^\d/.test(d.label) ? d.label : `a ${d.label.toLowerCase()}`} with GPS to rank`}</Text>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
        {`Times are age-graded against world bests for your age and sex (World Masters Athletics method), so everyone is ranked fairly. Your best effort in the last year counts (80%), plus how many of the last ${CONSISTENCY_WEEKS} weeks you ran (20%).${verifiedOnly ? '' : ' Manual runs count for your own rank; only GPS runs will count on leaderboards.'}`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  pills: { flexDirection: 'row', gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
});
