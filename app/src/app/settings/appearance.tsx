import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { ACCENT_ORDER, ACCENTS, buildTheme, type AccentId, type Appearance, type DarkStyle } from '../../core/theme/palette';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { SPRING } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Ring } from '../../ui/Ring';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';
import { Toggle } from '../../ui/Toggle';

function Swatch({ id, selected, dark, onPress }: { id: AccentId; selected: boolean; dark: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const color = dark ? ACCENTS[id].dark : ACCENTS[id].light;
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1 : 0.8, SPRING) }], opacity: withSpring(selected ? 1 : 0, SPRING) }));
  return (
    <PressableScale onPress={onPress} feedback="selection" scaleTo={0.9} style={styles.swatchWrap} accessibilityLabel={ACCENTS[id].name}>
      <View style={styles.swatchOuter}>
        <Animated.View style={[styles.swatchRing, { borderColor: color }, ring]} />
        <View style={[styles.swatch, { backgroundColor: color, borderColor: colors.separator }]}>
          {selected && <Icon name="check" size={18} color={id === 'mono' ? colors.background : '#FFFFFF'} strokeWidth={3} />}
        </View>
      </View>
      <Text variant="caption" tone={selected ? 'primary' : 'secondary'}>
        {ACCENTS[id].name}
      </Text>
    </PressableScale>
  );
}

function DarkStylePreview({ style, selected, onPress }: { style: DarkStyle; selected: boolean; onPress: () => void }) {
  const { colors, accentId } = useTheme();
  const preview = buildTheme(true, accentId, style).colors;
  return (
    <PressableScale onPress={onPress} feedback="selection" scaleTo={0.96} style={{ flex: 1, gap: SPACE.sm, alignItems: 'center' }}>
      <View style={[styles.preview, { backgroundColor: preview.background, borderColor: selected ? colors.accent : colors.separator }]}>
        <View style={[styles.previewCard, { backgroundColor: preview.surface }]}>
          <View style={[styles.previewLine, { backgroundColor: preview.text, width: '60%' }]} />
          <View style={[styles.previewLine, { backgroundColor: preview.textTertiary, width: '40%' }]} />
          <View style={[styles.previewBar, { backgroundColor: preview.accent }]} />
        </View>
      </View>
      <Text variant="subhead" weight={selected ? 'semibold' : 'regular'}>
        {style === 'black' ? 'True black' : 'Graphite'}
      </Text>
    </PressableScale>
  );
}

export default function AppearanceSettings() {
  const { colors, dark } = useTheme();
  const settings = useSettings();

  return (
    <Screen title="Appearance" back>
      <Card>
        <View style={styles.hero}>
          <Ring size={88} stroke={10} progress={0.72}>
            <Ring size={56} stroke={10} progress={0.5} color={colors.text} />
          </Ring>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="title3">Preview</Text>
            <Text variant="subhead" tone="secondary">
              Rings, buttons and highlights use your accent colour.
            </Text>
            <View style={[styles.pill, { backgroundColor: colors.accent }]}>
              <Text variant="footnote" weight="semibold" tone="onAccent">
                Button
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          MODE
        </Text>
        <SegmentedControl<Appearance>
          value={settings.appearance}
          onChange={(appearance) => settings.set({ appearance })}
          segments={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </View>

      <View style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          ACCENT
        </Text>
        <Card>
          <View style={styles.swatches}>
            {ACCENT_ORDER.map((id) => (
              <Swatch key={id} id={id} dark={dark} selected={settings.accent === id} onPress={() => settings.set({ accent: id })} />
            ))}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          DARK STYLE
        </Text>
        <Card>
          <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
            <DarkStylePreview style="black" selected={settings.darkStyle === 'black'} onPress={() => settings.set({ darkStyle: 'black' })} />
            <DarkStylePreview style="graphite" selected={settings.darkStyle === 'graphite'} onPress={() => settings.set({ darkStyle: 'graphite' })} />
          </View>
        </Card>
      </View>

      <ListGroup header="Feel">
        <ListRow title="Haptics" subtitle="Subtle taps on selections and actions" accessory={<Toggle value={settings.haptics} onChange={(haptics) => settings.set({ haptics })} />} />
      </ListGroup>

      <ListGroup header="Units">
        <ListRow title="Metric" subtitle="kg, cm" selected={settings.units === 'metric'} onPress={() => settings.set({ units: 'metric' })} chevron={false} />
        <ListRow title="Imperial" subtitle="lb, ft/in" selected={settings.units === 'imperial'} onPress={() => settings.set({ units: 'imperial' })} chevron={false} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xl },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, marginTop: 4 },
  label: { paddingHorizontal: SPACE.lg },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACE.lg },
  swatchWrap: { alignItems: 'center', gap: 6, width: 52 },
  swatchOuter: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 2.5 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  preview: { width: '100%', aspectRatio: 1.1, borderRadius: RADIUS.lg, borderWidth: 2, padding: 10, justifyContent: 'center' },
  previewCard: { borderRadius: 10, padding: 10, gap: 6 },
  previewLine: { height: 6, borderRadius: 3 },
  previewBar: { height: 8, borderRadius: 4, width: '80%', marginTop: 4 },
});
