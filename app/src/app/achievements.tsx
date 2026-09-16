import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { CATEGORY_LABEL, progressLabel, type AchievementCategory } from '../lib/achievements';
import { dateKey, formatShort } from '../lib/dates';
import { ACHIEVEMENT_TABLES, readAchievements, type AchievementState } from '../modules/achievements/repo';
import { AchievementBadge, CATEGORY_COLOR } from '../modules/ranks/components';
import { usePerson } from '../modules/ranks/usePerson';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import type { IconName } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { ProgressBar } from '../ui/ProgressBar';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

type Filter = 'all' | 'earned' | AchievementCategory;

export default function Achievements() {
  const { colors } = useTheme();
  const person = usePerson();
  const { targets } = useBody();
  const items = useQuery([...ACHIEVEMENT_TABLES], () => readAchievements(person, targets?.protein ?? null), [person?.weightKg, targets?.protein]);
  const [filter, setFilter] = useState<Filter>('all');

  const earned = items.filter((a) => a.earnedAt);
  const shown = items
    .filter((a) => (filter === 'all' ? true : filter === 'earned' ? a.earnedAt : a.def.category === filter))
    .sort((a, b) => Number(!!b.earnedAt) - Number(!!a.earnedAt) || b.progress - a.progress);
  const categories = Object.keys(CATEGORY_LABEL) as AchievementCategory[];

  return (
    <Screen title="Achievements" back>
      <Card index={0}>
        <View style={styles.summary}>
          <View style={{ flex: 1 }}>
            <Text variant="title1" tabular>{`${earned.length} of ${items.length}`}</Text>
            <Text variant="subhead" tone="secondary">
              badges earned
            </Text>
          </View>
          <View style={styles.recent}>
            {earned
              .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''))
              .slice(0, 3)
              .map((a) => (
                <AchievementBadge key={a.def.id} icon={a.def.icon as IconName} earned size={40} color={CATEGORY_COLOR[a.def.category]} />
              ))}
          </View>
        </View>
        <View style={{ marginTop: SPACE.md }}>
          <ProgressBar progress={items.length ? earned.length / items.length : 0} color={colors.accent} />
        </View>
      </Card>

      <View style={styles.filters}>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Earned" selected={filter === 'earned'} onPress={() => setFilter('earned')} />
        {categories.map((c) => (
          <Chip key={c} label={CATEGORY_LABEL[c]} selected={filter === c} onPress={() => setFilter(c)} />
        ))}
      </View>

      <View style={styles.grid}>
        {rows(shown).map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((a) => (a ? <Tile key={a.def.id} a={a} /> : <View key="spacer" style={{ flex: 1 }} />))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

function rows(list: AchievementState[]): (AchievementState | null)[][] {
  const out: (AchievementState | null)[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1] ?? null]);
  return out;
}

function Tile({ a }: { a: AchievementState }) {
  const { colors } = useTheme();
  const router = useRouter();
  const done = !!a.earnedAt;
  const color = CATEGORY_COLOR[a.def.category];
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => router.push({ pathname: '/share-card', params: { kind: 'achievement', id: a.def.id } })}
      style={[styles.tile, { backgroundColor: colors.surface }]}
    >
      <AchievementBadge icon={a.def.icon as IconName} earned={done} color={color} size={48} />
      <Text variant="headline" numberOfLines={2} style={{ marginTop: SPACE.sm }}>
        {a.def.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={3} style={{ flexGrow: 1 }}>
        {a.def.description}
      </Text>
      {done ? (
        <Text variant="caption" weight="semibold" color={color} style={{ marginTop: SPACE.sm }}>
          {`Earned ${formatShort(dateKey(new Date(a.earnedAt!)))}`}
        </Text>
      ) : (
        <View style={{ marginTop: SPACE.sm, gap: 4 }}>
          <ProgressBar progress={a.progress} color={color} height={4} />
          <Text variant="caption" tone="tertiary" tabular numberOfLines={1}>
            {progressLabel(a)}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  recent: { flexDirection: 'row', gap: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, paddingVertical: SPACE.lg },
  grid: { gap: SPACE.sm },
  gridRow: { flexDirection: 'row', gap: SPACE.sm },
  tile: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.lg, minHeight: 190 },
});
