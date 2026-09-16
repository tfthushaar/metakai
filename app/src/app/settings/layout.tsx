import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EMPTY_LAYOUT, featureOn, isShown, LAYOUTS, orderedSections, type LayoutScreen } from '../../core/store/layouts';
import { useSettings } from '../../core/store/settings';
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

export default function LayoutEditor() {
  const { colors } = useTheme();
  const { screen = 'today' } = useLocalSearchParams<{ screen?: LayoutScreen }>();
  const def = LAYOUTS[screen];
  const prefs = useSettings((s) => s.layouts[screen]) ?? EMPTY_LAYOUT;
  const layouts = useSettings((s) => s.layouts);
  const modules = useSettings((s) => s.enabledModules);
  const set = useSettings((s) => s.set);
  const sections = orderedSections(screen, prefs.order);

  const save = (patch: Partial<typeof prefs>) => set({ layouts: { ...layouts, [screen]: { ...prefs, ...patch } } });

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    haptic.selection();
    save({ order: ids });
  };

  const toggle = (id: string, on: boolean, hiddenByDefault?: boolean) => {
    if (hiddenByDefault) save({ shown: on ? [...prefs.shown, id] : prefs.shown.filter((x) => x !== id) });
    else save({ hidden: on ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] });
  };

  return (
    <Screen title={def.title} back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
        {`${def.description} Turn off what you don’t need and move the rest into the order you like. Items for features that are off stay hidden.`}
      </Text>
      <View style={{ gap: SPACE.sm }}>
        {sections.map((s, i) => {
          const off = !featureOn(s, modules);
          return (
            <Animated.View key={s.id} layout={layout} style={[styles.row, { backgroundColor: colors.surface, opacity: off ? 0.5 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={2}>
                  {s.name}
                </Text>
                {off && (
                  <Text variant="caption" tone="tertiary">
                    Feature is off
                  </Text>
                )}
              </View>
              <PressableScale disabled={i === 0} onPress={() => move(i, -1)} hitSlop={6} style={[styles.icon, { backgroundColor: colors.fill }]} accessibilityLabel={`Move ${s.name} up`}>
                <Icon name="arrowUp" size={16} color={colors.text} />
              </PressableScale>
              <PressableScale
                disabled={i === sections.length - 1}
                onPress={() => move(i, 1)}
                hitSlop={6}
                style={[styles.icon, { backgroundColor: colors.fill }]}
                accessibilityLabel={`Move ${s.name} down`}
              >
                <Icon name="arrowDown" size={16} color={colors.text} />
              </PressableScale>
              <Toggle value={isShown(s, prefs)} disabled={off} onChange={(on) => toggle(s.id, on, s.hiddenByDefault)} />
            </Animated.View>
          );
        })}
      </View>
      <View style={{ marginTop: SPACE.xl }}>
        <Button title="Reset to default" variant="gray" onPress={() => set({ layouts: { ...layouts, [screen]: EMPTY_LAYOUT } })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingLeft: SPACE.lg, paddingRight: SPACE.md, paddingVertical: SPACE.md, borderRadius: RADIUS.lg },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
