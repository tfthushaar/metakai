import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { orderedTodayCards, TODAY_CARDS, useSettings, type TodayCardId } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { layout } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Toggle } from '../../ui/Toggle';

export default function Dashboard() {
  const { colors } = useTheme();
  const order = useSettings((s) => s.todayOrder);
  const hidden = useSettings((s) => s.todayHidden);
  const modules = useSettings((s) => s.enabledModules);
  const set = useSettings((s) => s.set);
  const cards = orderedTodayCards(order);

  const move = (id: TodayCardId, delta: -1 | 1) => {
    const i = cards.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= cards.length) return;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    haptic.selection();
    set({ todayOrder: next });
  };

  return (
    <Screen title="Today layout" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
        Choose which cards appear on Today and in what order. Cards for features you have turned off stay hidden.
      </Text>
      <View style={{ gap: SPACE.sm }}>
        {cards.map((id, i) => {
          const card = TODAY_CARDS.find((c) => c.id === id)!;
          const moduleOff = card.module != null && !modules.includes(card.module);
          return (
            <Animated.View key={id} layout={layout} style={[styles.row, { backgroundColor: colors.surface, opacity: moduleOff ? 0.5 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{card.name}</Text>
                {moduleOff && (
                  <Text variant="caption" tone="tertiary">
                    Feature is off
                  </Text>
                )}
              </View>
              <PressableScale disabled={i === 0} onPress={() => move(id, -1)} hitSlop={6} style={[styles.icon, { backgroundColor: colors.fill }]}>
                <Icon name="arrowUp" size={16} color={colors.text} />
              </PressableScale>
              <PressableScale disabled={i === cards.length - 1} onPress={() => move(id, 1)} hitSlop={6} style={[styles.icon, { backgroundColor: colors.fill }]}>
                <Icon name="arrowDown" size={16} color={colors.text} />
              </PressableScale>
              <Toggle
                value={!hidden.includes(id)}
                disabled={moduleOff}
                onChange={(on) => set({ todayHidden: on ? hidden.filter((h) => h !== id) : [...hidden, id] })}
              />
            </Animated.View>
          );
        })}
      </View>
      <View style={{ marginTop: SPACE.xl }}>
        <Button title="Reset layout" variant="gray" onPress={() => set({ todayOrder: TODAY_CARDS.map((c) => c.id), todayHidden: [] })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingLeft: SPACE.lg, paddingRight: SPACE.md, paddingVertical: SPACE.md, borderRadius: RADIUS.lg },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
