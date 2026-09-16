import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { dateKey } from '../lib/dates';
import { CM_PER_IN } from '../lib/units';
import { latestMeasurements, MEASUREMENT_SITES, saveMeasurements, type MeasurementSite } from '../modules/body/repo';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

export default function LogMeasurements() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const latest = useQuery(['measurements'], latestMeasurements);
  const [values, setValues] = useState<Partial<Record<MeasurementSite, string>>>({});
  const unit = units === 'metric' ? 'cm' : 'in';

  const toCm = (text: string) => {
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return null;
    return units === 'metric' ? v : v * CM_PER_IN;
  };
  const entered = Object.entries(values).filter(([, t]) => t && toCm(t) != null);

  const save = () => {
    const cm: Partial<Record<MeasurementSite, number>> = {};
    for (const [site, text] of entered) cm[site as MeasurementSite] = toCm(text!)!;
    saveMeasurements(dateKey(), cm);
    haptic.success();
    toast(`Saved ${entered.length} ${entered.length === 1 ? 'measurement' : 'measurements'}`);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + 40, gap: SPACE.sm }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Measurements</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>
        <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.md }}>
          Fill in the ones you measured today. Same time of day, tape snug but not tight.
        </Text>

        {MEASUREMENT_SITES.map((site) => {
          const last = latest[site.id];
          return (
            <View key={site.id} style={[styles.row, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{site.label}</Text>
                <Text variant="caption" tone="tertiary">
                  {last ? `Last ${(units === 'metric' ? last.cm : last.cm / CM_PER_IN).toFixed(1)} ${unit} · ${site.hint}` : site.hint}
                </Text>
              </View>
              <TextInput
                value={values[site.id] ?? ''}
                onChangeText={(t) => setValues((v) => ({ ...v, [site.id]: t }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.accent}
                style={[TYPE.headline, styles.input, { color: colors.text, backgroundColor: colors.fill }]}
              />
              <Text variant="subhead" tone="secondary" numberOfLines={1} style={{ minWidth: 22 }}>
                {unit}
              </Text>
            </View>
          );
        })}

        <View style={{ marginTop: SPACE.md }}>
          <Button title="Save" onPress={save} disabled={entered.length === 0} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingLeft: SPACE.lg, paddingRight: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.lg },
  input: { width: 80, height: 40, borderRadius: RADIUS.sm, textAlign: 'center', paddingVertical: 0 },
});
