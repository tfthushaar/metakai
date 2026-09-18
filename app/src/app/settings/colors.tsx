import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSettings } from '../../core/store/settings';
import { DEFAULT_CUSTOM_COLORS, type CustomColors } from '../../core/theme/palette';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ColorPicker } from '../../ui/ColorPicker';
import { ListGroup, ListRow } from '../../ui/List';
import { ProgressBar } from '../../ui/ProgressBar';
import { Ring } from '../../ui/Ring';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';
import { Toggle } from '../../ui/Toggle';

type Slot = 'primary' | 'secondary' | 'background';

const SLOT_HINT: Record<Slot, string> = {
  primary: 'Buttons, rings, protein and highlights.',
  secondary: 'Carbs, trend lines and secondary highlights.',
  background: 'Cards, borders and text follow it so everything stays readable.',
};

/** Pick Colour 1, Colour 2 and an optional background for the Custom theme. The app updates live. */
export default function CustomColorsScreen() {
  const { colors } = useTheme();
  const custom = useSettings((s) => s.customColors);
  const set = useSettings((s) => s.set);
  const [slot, setSlot] = useState<Slot>('primary');

  const update = (patch: Partial<CustomColors>) => set({ accent: 'custom', customColors: { ...useSettings.getState().customColors, ...patch } });
  const value = slot === 'background' ? (custom.background ?? '#101014') : custom[slot];

  return (
    <Screen title="Custom colours" back>
      <Card>
        <View style={styles.preview}>
          <Ring size={72} stroke={9} progress={0.7}>
            <Text variant="caption" weight="semibold" tabular>
              70%
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: SPACE.sm }}>
            <View style={styles.previewRow}>
              <Text variant="footnote" tone="secondary">
                Protein
              </Text>
              <View style={{ flex: 1 }}>
                <ProgressBar progress={0.7} color={colors.accent} height={5} />
              </View>
            </View>
            <View style={styles.previewRow}>
              <Text variant="footnote" tone="secondary">
                Carbs
              </Text>
              <View style={{ flex: 1 }}>
                <ProgressBar progress={0.45} color={colors.accent2} height={5} />
              </View>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.accent }]}>
              <Text variant="footnote" weight="semibold" tone="onAccent">
                Button
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: SPACE.xl }}>
        <SegmentedControl<Slot>
          value={slot}
          onChange={setSlot}
          segments={[
            { value: 'primary', label: 'Colour 1' },
            { value: 'secondary', label: 'Colour 2' },
            { value: 'background', label: 'Background' },
          ]}
        />
      </View>
      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.sm }}>
        {SLOT_HINT[slot]}
      </Text>

      {slot === 'background' && (
        <ListGroup>
          <ListRow
            title="Custom background"
            subtitle={custom.background ? 'Light or dark mode no longer applies' : 'Uses the light or dark background'}
            accessory={<Toggle value={custom.background != null} onChange={(on) => update({ background: on ? '#101014' : null })} />}
          />
        </ListGroup>
      )}

      {(slot !== 'background' || custom.background != null) && (
        <Card style={{ marginTop: SPACE.lg }}>
          <ColorPicker key={slot} value={value} onChange={(hex) => update({ [slot]: hex })} />
        </Card>
      )}

      <View style={{ marginTop: SPACE.xl }}>
        <Button title="Reset custom colours" variant="gray" onPress={() => update(DEFAULT_CUSTOM_COLORS)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.pill },
});
