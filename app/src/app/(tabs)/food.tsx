import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBody } from '../../core/goals/useBody';
import { deleteLogEntry, listLog, MEAL_SLOTS, restoreLogEntry, type LogEntry, type MealSlot } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { useTheme } from '../../core/theme/ThemeProvider';
import { useFeature, useSettings } from '../../core/store/settings';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../../lib/dates';
import { MacroInline, MacroSummary } from '../../modules/food/components';
import { formatAmount, sumMacros } from '../../modules/food/parse';
import { Card } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { layout } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';

const SOURCE_LABEL: Record<LogEntry['source'], string | null> = { local: null, custom: 'Custom', quick: 'Quick add', ai: 'AI estimate' };

function EntryRow({ entry }: { entry: LogEntry }) {
  const { colors } = useTheme();
  const router = useRouter();
  const remove = () => {
    haptic.medium();
    deleteLogEntry(entry.id);
    toast(`Removed ${entry.name}`, { label: 'Undo', onPress: () => restoreLogEntry(entry.id) });
  };
  const qty = entry.unit === 'g' || entry.unit === 'ml' ? `${Math.round(entry.quantity)} ${entry.unit}` : formatAmount(entry.quantity, entry.unit);
  const badge = SOURCE_LABEL[entry.source];

  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={60}
      overshootRight={false}
      renderRightActions={() => (
        <PressableScale onPress={remove} style={[styles.deleteAction, { backgroundColor: colors.danger }]}>
          <Icon name="trash" size={20} color="#FFFFFF" />
        </PressableScale>
      )}
    >
      <PressableScale
        scaleTo={0.995}
        feedback="selection"
        onPress={() => router.push({ pathname: '/log-entry', params: { id: entry.id } })}
        style={[styles.entry, { backgroundColor: colors.surface }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {`${qty}${badge ? ` · ${badge}` : ''}`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="body" weight="semibold" tabular>
            {Math.round(entry.kcal)}
          </Text>
          <MacroInline macros={entry} showKcal={false} />
        </View>
        <Icon name="chevronRight" size={16} color={colors.textTertiary} />
      </PressableScale>
    </ReanimatedSwipeable>
  );
}

function MealSection({ slot, title, entries, dateKeyValue, index }: { slot: MealSlot; title: string; entries: LogEntry[]; dateKeyValue: string; index: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const totals = sumMacros(entries);
  return (
    <Card index={index} padded={false} style={{ marginTop: SPACE.md }}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{title}</Text>
          {entries.length > 0 && <MacroInline macros={totals} />}
        </View>
        <PressableScale
          feedback="light"
          scaleTo={0.9}
          accessibilityLabel={`Add to ${title}`}
          onPress={() => router.push({ pathname: '/log-food', params: { slot, date: dateKeyValue } })}
          style={[styles.addButton, { backgroundColor: colors.accentSoft }]}
        >
          <Icon name="plus" size={18} color={colors.accent} strokeWidth={2.6} />
        </PressableScale>
      </View>
      {entries.map((e) => (
        <Animated.View key={e.id} layout={layout} entering={FadeIn.duration(220)}>
          <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          <EntryRow entry={e} />
        </Animated.View>
      ))}
    </Card>
  );
}

export default function Food() {
  const { colors } = useTheme();
  const router = useRouter();
  const [day, setDay] = useState(dateKey());
  const today = dateKey();
  const log = useQuery(['log_entries'], () => listLog(day), [day]);
  const { targets } = useBody();
  const recipesOn = useFeature('recipes');
  const pantry = useSettings((s) => s.pantry);
  const eaten = useMemo(() => sumMacros(log), [log]);

  const shift = (delta: number) => {
    const next = addDays(day, delta);
    if (next > today) return;
    haptic.selection();
    setDay(next);
  };

  return (
    <Screen
      title="Food"
      tabBar
      accessory={
        <PressableScale
          feedback="selection"
          onPress={() => router.push({ pathname: '/quick-add', params: { date: day } })}
          style={[styles.quickAdd, { backgroundColor: colors.fill }]}
        >
          <Text variant="subhead" weight="semibold">
            Quick add
          </Text>
        </PressableScale>
      }
    >
      <View style={styles.dayNav}>
        <PressableScale onPress={() => shift(-1)} hitSlop={10} style={[styles.navButton, { backgroundColor: colors.fill }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </PressableScale>
        <Animated.View key={day} entering={FadeIn.duration(200)} style={{ flex: 1 }}>
          <Text variant="headline" align="center">
            {relativeDay(day, today)}
          </Text>
        </Animated.View>
        <PressableScale onPress={() => shift(1)} disabled={day >= today} hitSlop={10} style={[styles.navButton, { backgroundColor: colors.fill }]}>
          <Icon name="chevronRight" size={20} color={colors.text} />
        </PressableScale>
      </View>

      {targets && (
        <Card index={0}>
          <MacroSummary eaten={eaten} targets={targets} />
        </Card>
      )}

      {recipesOn && (
        <Card index={1} style={{ marginTop: SPACE.md }} onPress={() => router.push('/recipes')}>
          <View style={styles.recipeRow}>
            <View style={[styles.recipeIcon, { backgroundColor: colors.fill }]}>
              <Icon name="sparkles" size={18} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">Recipe ideas</Text>
              <Text variant="footnote" tone="secondary">
                {pantry.length > 0 ? `${pantry.length} ingredients saved` : 'From the ingredients you have'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textTertiary} />
          </View>
        </Card>
      )}

      {MEAL_SLOTS.map((slot, i) => (
        <MealSection
          key={`${day}-${slot.id}`}
          slot={slot.id}
          title={slot.title}
          entries={log.filter((e) => e.mealSlot === slot.id)}
          dateKeyValue={day}
          index={i + 1}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  recipeIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  dayNav: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md, gap: SPACE.md },
  navButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickAdd: { paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill, justifyContent: 'center', marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACE.lg, gap: SPACE.md },
  addButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.lg },
  entry: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: SPACE.md },
  deleteAction: { width: 80, alignItems: 'center', justifyContent: 'center' },
});
