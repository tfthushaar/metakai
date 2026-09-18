import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { deleteLogEntry, getLogEntry, MEAL_SLOTS, updateLogEntry, type MealSlot } from '../core/db/repo';
import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Screen } from '../ui/Screen';
import { Stepper } from '../ui/Stepper';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

interface Draft {
  name: string;
  slot: MealSlot;
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** Edits one logged food item: the amount scales its macros, and each macro can still be set by hand. */
export default function LogEntryEdit() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useQuery(['log_entries'], () => (id ? getLogEntry(id) : null), [id]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const current: Draft | null =
    draft ??
    (entry
      ? { name: entry.name, slot: entry.mealSlot, quantity: entry.quantity, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber }
      : null);

  if (!entry || !current) {
    return (
      <Screen title="Edit item" back>
        <Text tone="secondary">This item is no longer in your log.</Text>
      </Screen>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...current, ...patch });

  /** Changing the amount scales the macros that came with it. */
  const setQuantity = (quantity: number) => {
    const factor = current.quantity > 0 ? quantity / current.quantity : 1;
    const scale = (n: number) => Math.round(n * factor * 10) / 10;
    set({
      quantity,
      kcal: Math.round(current.kcal * factor),
      protein: scale(current.protein),
      carbs: scale(current.carbs),
      fat: scale(current.fat),
      fiber: scale(current.fiber),
    });
  };

  const save = () => {
    const grams =
      entry.unit === 'g' || entry.unit === 'ml'
        ? current.quantity
        : entry.grams != null && entry.quantity > 0
          ? Math.round((entry.grams / entry.quantity) * current.quantity)
          : entry.grams;
    updateLogEntry(entry.id, {
      name: current.name.trim() || entry.name,
      mealSlot: current.slot,
      quantity: current.quantity,
      grams,
      kcal: current.kcal,
      protein: current.protein,
      carbs: current.carbs,
      fat: current.fat,
      fiber: current.fiber,
    });
    haptic.success();
    toast('Item updated');
    router.back();
  };

  const remove = () =>
    Alert.alert(`Delete ${entry.name}?`, 'It is removed from this day’s log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteLogEntry(entry.id);
          haptic.medium();
          toast('Item deleted');
          router.back();
        },
      },
    ]);

  const byWeight = entry.unit === 'g' || entry.unit === 'ml';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen title="Edit item" back>
        <View style={{ gap: SPACE.lg }}>
          <TextField label="Name" value={current.name} onChangeText={(name) => set({ name })} />

          <View style={styles.chips}>
            {MEAL_SLOTS.map((s) => (
              <Chip key={s.id} label={s.title} selected={current.slot === s.id} onPress={() => set({ slot: s.id })} />
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Stepper
              label="Amount"
              sublabel="Macros scale with it"
              unit={entry.unit}
              value={current.quantity}
              onChange={setQuantity}
              step={byWeight ? 10 : 0.5}
              min={0}
              decimals={byWeight ? 0 : 1}
              valueWidth={92}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Stepper label="Calories" unit="kcal" value={current.kcal} onChange={(kcal) => set({ kcal })} step={10} valueWidth={92} />
            <Stepper label="Protein" unit="g" value={current.protein} onChange={(protein) => set({ protein })} decimals={1} valueWidth={92} />
            <Stepper label="Carbs" unit="g" value={current.carbs} onChange={(carbs) => set({ carbs })} decimals={1} valueWidth={92} />
            <Stepper label="Fat" unit="g" value={current.fat} onChange={(fat) => set({ fat })} decimals={1} valueWidth={92} />
            <Stepper label="Fiber" unit="g" value={current.fiber} onChange={(fiber) => set({ fiber })} decimals={1} valueWidth={92} />
          </View>

          <Button title="Save" onPress={save} />
          <Button title="Delete item" variant="destructive" onPress={remove} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  card: { borderRadius: RADIUS.xl, padding: SPACE.lg, gap: SPACE.sm },
});
