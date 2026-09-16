import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { subscribe } from '../../core/db/database';
import { useQuery } from '../../core/db/useQuery';
import { useBody } from '../../core/goals/useBody';
import { useFeature } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { Card, SectionHeader } from '../../ui/Card';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { ACHIEVEMENT_TABLES, earnedAchievements, syncAchievements } from '../achievements/repo';
import { leaderboardsAvailable, syncScores } from '../leaderboards/api';
import { useSettings } from '../../core/store/settings';
import { ACHIEVEMENTS } from '../../lib/achievements';
import { tierFor } from '../../lib/ranks';
import { AchievementBadge, CATEGORY_COLOR, TierBadge } from './components';
import { currentPhysiqueRank, currentRunRank } from './repo';
import { usePerson } from './usePerson';

const RANK_TABLES = ['workouts', 'workout_exercises', 'workout_sets', 'cardio_sessions', 'weight_entries', 'profile'] as const;

function useRanks() {
  const person = usePerson();
  const physiqueOn = useFeature('rank_physique');
  const runOn = useFeature('rank_run');
  const deps = [person?.weightKg, person?.age, person?.sex, person?.heightCm, physiqueOn, runOn];
  const physique = useQuery([...RANK_TABLES], () => (person && physiqueOn ? currentPhysiqueRank(person) : null), deps);
  const run = useQuery([...RANK_TABLES], () => (person && runOn ? currentRunRank(person) : null), deps);
  return { physique, run, physiqueOn, runOn };
}

/** Pass cards and achievements for the Progress tab. */
export function RanksSection() {
  const { colors } = useTheme();
  const router = useRouter();
  const { physique, run, physiqueOn, runOn } = useRanks();
  const achievementsOn = useFeature('achievements');
  const lbJoined = useSettings((st) => st.leaderboard.joined);
  const earned = useQuery(['achievements'], earnedAchievements);
  const recent = [...earned.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 4)
    .map(([id]) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((a) => a != null);

  return (
    <>
      <SectionHeader title="Ranks" />
      <View style={{ gap: SPACE.md }}>
        {(physiqueOn || runOn) && (
          <View style={styles.passes}>
            {physiqueOn && (
              <Card onPress={() => router.push('/rank-physique')} containerStyle={{ flex: 1 }} style={styles.pass}>
                <TierBadge tier={physique?.tier ?? tierFor(0)} size={56} locked={!physique?.rankedCount} />
                <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm }}>
                  Physique
                </Text>
                <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit>
                  {physique?.rankedCount ? physique.tier.label : 'Unranked'}
                </Text>
              </Card>
            )}
            {runOn && (
              <Card onPress={() => router.push('/rank-run')} containerStyle={{ flex: 1 }} style={styles.pass}>
                <TierBadge tier={run?.tier ?? tierFor(0)} size={56} locked={!run?.best} />
                <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm }}>
                  Running
                </Text>
                <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit>
                  {run?.best ? run.tier.label : 'Unranked'}
                </Text>
              </Card>
            )}
          </View>
        )}
        {leaderboardsAvailable && (physiqueOn || runOn) && (
          <Card onPress={() => router.push('/leaderboard')}>
            <View style={styles.row}>
              <View style={[styles.lbIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name="trophy" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="headline">Leaderboards</Text>
                <Text variant="footnote" tone="secondary">
                  {lbJoined ? 'See where you stand' : 'Compare with other people'}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textTertiary} />
            </View>
          </Card>
        )}
        {achievementsOn && (
          <Card onPress={() => router.push('/achievements')}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">Achievements</Text>
                <Text variant="footnote" tone="secondary">{`${earned.size} of ${ACHIEVEMENTS.length} earned`}</Text>
              </View>
              <View style={styles.recent}>
                {recent.map((a) => (
                  <AchievementBadge key={a!.id} icon={a!.icon as IconName} earned size={32} color={CATEGORY_COLOR[a!.category]} />
                ))}
              </View>
              <Icon name="chevronRight" size={18} color={colors.textTertiary} />
            </View>
          </Card>
        )}
      </View>
    </>
  );
}

/** Compact ranks card for Today. */
export function RanksTodayCard({ index }: { index: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { physique, run, physiqueOn, runOn } = useRanks();
  const items = [
    physiqueOn && { key: 'physique', label: 'Physique', tier: physique?.tier, ranked: !!physique?.rankedCount, to: '/rank-physique' as const },
    runOn && { key: 'run', label: 'Running', tier: run?.tier, ranked: !!run?.best, to: '/rank-run' as const },
  ].filter(Boolean) as {
    key: string;
    label: string;
    tier: NonNullable<typeof physique>['tier'] | undefined;
    ranked: boolean;
    to: '/rank-physique' | '/rank-run';
  }[];
  return (
    <Card index={index} padded={false}>
      <View style={styles.todayRow}>
        {items.map((it, i) => (
          <PressableScale
            key={it.key}
            scaleTo={0.98}
            onPress={() => router.push(it.to)}
            style={[styles.todayItem, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.separator }]}
          >
            <TierBadge tier={it.tier ?? tierFor(0)} size={44} locked={!it.ranked} />
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="secondary">
                {it.label}
              </Text>
              <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit>
                {it.ranked && it.tier ? it.tier.label : 'Unranked'}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </Card>
  );
}

/** Saves newly earned achievements in the background and announces them. */
export function AchievementWatcher() {
  const on = useFeature('achievements');
  const person = usePerson();
  const { targets } = useBody();
  const input = useRef({ person, protein: targets?.protein ?? null });
  input.current = { person, protein: targets?.protein ?? null };

  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      try {
        const { unlocked } = syncAchievements(input.current.person, input.current.protein);
        if (unlocked.length === 1) toast(`Achievement unlocked · ${unlocked[0].def.title}`);
        else if (unlocked.length > 1) toast(`${unlocked.length} achievements unlocked`);
      } catch {
        // Achievements are a nice-to-have; never break the app over them.
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 2500);
    };
    schedule();
    const unsubscribe = subscribe(
      ACHIEVEMENT_TABLES.filter((t) => t !== 'achievements'),
      schedule,
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [on, person?.weightKg, targets?.protein]);

  return null;
}

const styles = StyleSheet.create({
  passes: { flexDirection: 'row', gap: SPACE.md },
  pass: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  recent: { flexDirection: 'row', gap: 4 },
  todayRow: { flexDirection: 'row' },
  lbIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
});

/** Keeps leaderboard scores current: after rank changes and when the app comes to the foreground. */
export function LeaderboardSync() {
  const joined = useSettings((st) => st.leaderboard.joined);
  const person = usePerson();
  const personRef = useRef(person);
  personRef.current = person;

  useEffect(() => {
    if (!joined || !leaderboardsAvailable) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const p = personRef.current;
      if (!p) return;
      const s = useSettings.getState();
      const physique = s.enabledModules.includes('rank_physique') ? currentPhysiqueRank(p) : null;
      const runRank = s.enabledModules.includes('rank_run') ? currentRunRank(p) : null;
      syncScores(p, physique, runRank).catch(() => {});
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 10_000);
    };
    schedule();
    const unsubscribe = subscribe([...RANK_TABLES], schedule);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && schedule());
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      sub.remove();
    };
  }, [joined]);

  return null;
}
