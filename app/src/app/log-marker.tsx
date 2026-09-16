import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../lib/dates';
import { addMarker, LAB_SUGGESTIONS, MARKERS, type MarkerKind } from '../modules/health/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const DAY_OFFSETS = [0, -1, -2, -7];
const num = (t: string) => {
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};

export default function LogMarker() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: MarkerKind; label?: string }>();
  const [kind, setKind] = useState<MarkerKind>(params.kind ?? 'bp');
  const [label, setLabel] = useState(params.label ?? '');
  const [unit, setUnit] = useState(LAB_SUGGESTIONS.find((l) => l.label === params.label)?.unit ?? '');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [dayOffset, setDayOffset] = useState(0);

  const def = MARKERS.find((m) => m.kind === kind);
  const v1 = num(value);
  const v2 = num(value2);
  const ready = v1 != null && (kind !== 'bp' || v2 != null) && (kind !== 'custom' || label.trim().length > 0);
  const note = def?.check && v1 != null ? def.check(v1, v2) : null;

  const save = () => {
    addMarker({
      dateKey: addDays(dateKey(), dayOffset),
      kind,
      label: kind === 'custom' ? label : null,
      value: v1!,
      value2: kind === 'bp' ? v2 : null,
      unit: kind === 'custom' ? unit.trim() || null : def!.unit,
    });
    haptic.success();
    toast('Saved');
    router.back();
  };

  const field = (text: string, onChange: (t: string) => void, placeholder: string, suffix?: string) => (
    <View style={[styles.field, { backgroundColor: colors.surface }]}>
      <TextInput
        value={text}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        style={[TYPE.title2, styles.bigInput, { color: colors.text }]}
      />
      {suffix ? (
        <Text variant="subhead" tone="secondary">
          {suffix}
        </Text>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + 40, gap: SPACE.md }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Log health marker</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>

        <View style={styles.chips}>
          {MARKERS.map((m) => (
            <Chip key={m.kind} label={m.name} selected={kind === m.kind} onPress={() => setKind(m.kind)} />
          ))}
          <Chip label="Lab result" selected={kind === 'custom'} onPress={() => setKind('custom')} />
        </View>

        {def && (
          <Text variant="subhead" tone="secondary">
            {def.hint}
          </Text>
        )}

        {kind === 'custom' && (
          <>
            <View style={styles.chips}>
              {LAB_SUGGESTIONS.map((l) => (
                <Chip
                  key={l.label}
                  label={l.label}
                  selected={label === l.label}
                  onPress={() => {
                    setLabel(l.label);
                    setUnit(l.unit);
                  }}
                />
              ))}
            </View>
            <View style={styles.row}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Test name"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.accent}
                style={[TYPE.body, styles.input, { flex: 2, color: colors.text, backgroundColor: colors.surface }]}
              />
              <TextInput
                value={unit}
                onChangeText={setUnit}
                placeholder="Unit"
                autoCapitalize="none"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.accent}
                style={[TYPE.body, styles.input, { flex: 1, color: colors.text, backgroundColor: colors.surface }]}
              />
            </View>
          </>
        )}

        {kind === 'bp' ? (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="footnote" tone="secondary" style={styles.label}>
                SYSTOLIC
              </Text>
              {field(value, setValue, '120')}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="footnote" tone="secondary" style={styles.label}>
                DIASTOLIC
              </Text>
              {field(value2, setValue2, '80')}
            </View>
          </View>
        ) : (
          field(value, setValue, '—', kind === 'custom' ? unit : def?.unit)
        )}

        {note && (
          <View style={[styles.note, { backgroundColor: colors.fill }]}>
            <Icon name="info" size={16} color={colors.warning} />
            <Text variant="subhead" style={{ flex: 1 }}>
              {note}
            </Text>
          </View>
        )}

        <Text variant="footnote" tone="secondary" style={[styles.label, { marginTop: SPACE.sm }]}>
          WHEN
        </Text>
        <View style={styles.chips}>
          {DAY_OFFSETS.map((o) => (
            <Chip key={o} label={o === -7 ? 'Last week' : relativeDay(addDays(dateKey(), o))} selected={dayOffset === o} onPress={() => setDayOffset(o)} />
          ))}
        </View>

        <View style={{ marginTop: SPACE.md }}>
          <Button title="Save" onPress={save} disabled={!ready} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
  label: { paddingHorizontal: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.lg },
  bigInput: { flex: 1, paddingVertical: SPACE.md },
  input: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.md },
});
