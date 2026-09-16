import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addCustomFood, addLogEntries, MEAL_SLOTS, type MealSlot } from '../core/db/repo';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { dateKey } from '../lib/dates';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';
import { Toggle } from '../ui/Toggle';

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

export default function QuickAdd() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const [slot, setSlot] = useState<MealSlot>('snacks');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saveFood, setSaveFood] = useState(false);

  const macroKcal = num(protein) * 4 + num(carbs) * 4 + num(fat) * 9;
  const calories = kcal ? num(kcal) : macroKcal;
  const canSave = calories > 0;

  const save = () => {
    const label = name.trim() || 'Quick add';
    addLogEntries([
      {
        dateKey: params.date ?? dateKey(),
        mealSlot: slot,
        foodRef: null,
        name: label,
        quantity: 1,
        unit: 'serving',
        grams: null,
        kcal: calories,
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
        fiber: 0,
        source: saveFood ? 'custom' : 'quick',
        rawInput: null,
      },
    ]);
    if (saveFood && name.trim()) {
      addCustomFood({ name: label, kcal: calories, protein: num(protein), carbs: num(carbs), fat: num(fat), fiber: 0, servingName: 'serving', servingGrams: 100 });
    }
    haptic.success();
    toast(`Added ${Math.round(calories)} kcal`);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, gap: SPACE.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Quick add</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>
        <SegmentedControl<MealSlot> value={slot} onChange={setSlot} segments={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.title }))} />
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Protein bar, restaurant meal…" />
        <TextField
          label="Calories"
          value={kcal}
          onChangeText={setKcal}
          keyboardType="decimal-pad"
          placeholder={macroKcal > 0 ? String(Math.round(macroKcal)) : '0'}
          suffix="kcal"
        />
        <View style={styles.macroRow}>
          <View style={{ flex: 1 }}>
            <TextField label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="0" suffix="g" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholder="0" suffix="g" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="0" suffix="g" />
          </View>
        </View>
        {kcal !== '' && macroKcal > 0 && Math.abs(macroKcal - num(kcal)) > Math.max(40, num(kcal) * 0.15) && (
          <Text variant="footnote" tone="warning">
            {`Macros add up to ${Math.round(macroKcal)} kcal. Check the numbers.`}
          </Text>
        )}
        <View style={[styles.toggleRow, { backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Save as a food</Text>
            <Text variant="footnote" tone="secondary">
              Then type its name when logging to reuse it.
            </Text>
          </View>
          <Toggle value={saveFood} onChange={setSaveFood} disabled={!name.trim()} />
        </View>
        <Button title="Add" onPress={save} disabled={!canSave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  macroRow: { flexDirection: 'row', gap: SPACE.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.lg, borderRadius: 16, gap: SPACE.md },
});
