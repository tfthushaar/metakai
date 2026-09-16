import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../core/auth/auth';
import { cloudEnabled } from '../core/auth/supabase';
import { addLogEntries, frequentFoods, listCustomFoods, MEAL_SLOTS, type LogEntry, type MealSlot, type NewLogEntry } from '../core/db/repo';
import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { dateKey } from '../lib/dates';
import { parseWithAi } from '../modules/food/ai';
import { MacroInline } from '../modules/food/components';
import type { Food } from '../modules/food/foods';
import { formatAmount, parseMeal, sumMacros, unitOptions, withQuantity, type ParsedItem } from '../modules/food/parse';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

function defaultSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18) return 'snacks';
  return 'dinner';
}

function stepFor(unit: string) {
  if (unit === 'g' || unit === 'ml') return 10;
  if (['katori', 'bowl', 'plate', 'cup', 'glass'].includes(unit)) return 0.5;
  return 1;
}

const formatQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, ''));

function ItemRow({ item, onChange, onRemove }: { item: ParsedItem; onChange: (item: ParsedItem) => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(item.confidence === 'none');
  const [qtyText, setQtyText] = useState(formatQty(item.quantity));
  useEffect(() => setQtyText(formatQty(item.quantity)), [item.quantity]);
  const units = unitOptions(item.food);
  const step = stepFor(item.unit);
  const dot = { high: colors.success, medium: colors.warning, low: colors.warning, none: colors.danger }[item.confidence];
  const label = item.food?.id.startsWith('ai:') ? 'AI estimate' : item.confidence === 'none' ? 'Not found · enter calories' : null;

  const setManual = (key: 'kcal' | 'protein' | 'carbs' | 'fat', text: string) => {
    const v = Number(text.replace(',', '.')) || 0;
    onChange({ ...item, macros: { ...item.macros, [key]: v } });
  };

  return (
    <Animated.View layout={layout} entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={[styles.item, { backgroundColor: colors.surface }]}>
      <PressableScale onPress={() => setExpanded((e) => !e)} scaleTo={0.99} style={styles.itemHeader}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {`${formatAmount(item.quantity, item.unit)}${item.grams && item.unit !== 'g' && item.unit !== 'ml' ? ` · ${Math.round(item.grams)} ${item.food?.liquid ? 'ml' : 'g'}` : ''}${label ? ` · ${label}` : ''}`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="headline" tabular>
            {Math.round(item.macros.kcal)}
          </Text>
          <MacroInline macros={item.macros} showKcal={false} />
        </View>
      </PressableScale>

      {expanded && (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.editor, { borderTopColor: colors.separator }]}>
          {item.food ? (
            <>
              <View style={styles.stepperRow}>
                <PressableScale
                  feedback="selection"
                  onPress={() => onChange(withQuantity(item, Math.max(step, +(item.quantity - step).toFixed(2)), item.unit))}
                  style={[styles.stepButton, { backgroundColor: colors.fill }]}
                >
                  <Icon name="minus" size={18} color={colors.text} />
                </PressableScale>
                <TextInput
                  value={qtyText}
                  onChangeText={(t) => {
                    setQtyText(t);
                    const v = Number(t.replace(',', '.'));
                    if (Number.isFinite(v) && v >= 0) onChange(withQuantity(item, v, item.unit));
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[TYPE.title2, styles.qtyInput, { color: colors.text, backgroundColor: colors.fill }]}
                />
                <PressableScale
                  feedback="selection"
                  onPress={() => onChange(withQuantity(item, +(item.quantity + step).toFixed(2), item.unit))}
                  style={[styles.stepButton, { backgroundColor: colors.fill }]}
                >
                  <Icon name="plus" size={18} color={colors.text} />
                </PressableScale>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
                {units.map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    selected={u === item.unit}
                    onPress={() => {
                      const q = u === 'g' || u === 'ml' ? Math.round(item.grams) || 100 : 1;
                      onChange(withQuantity(item, q, u));
                    }}
                  />
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={styles.manualGrid}>
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <View key={k} style={{ flex: 1, gap: 4 }}>
                  <Text variant="caption" tone="secondary">
                    {k === 'kcal' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)} g`}
                  </Text>
                  <TextInput
                    defaultValue={item.macros[k] ? String(item.macros[k]) : ''}
                    onChangeText={(t) => setManual(k, t)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    style={[TYPE.headline, styles.manualInput, { color: colors.text, backgroundColor: colors.fill }]}
                  />
                </View>
              ))}
            </View>
          )}
          <Button title="Remove" variant="destructive" size="sm" full={false} icon="trash" onPress={onRemove} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

function entryToItem(e: LogEntry): ParsedItem {
  const grams = e.grams ?? 100;
  const k = 100 / Math.max(grams, 1);
  const food: Food = {
    id: e.foodRef ?? `history:${e.name}`,
    name: e.name,
    aliases: [],
    per100: { kcal: e.kcal * k, protein: e.protein * k, carbs: e.carbs * k, fat: e.fat * k, fiber: e.fiber * k },
    units: { [e.unit]: grams / Math.max(e.quantity, 0.01), g: 1 },
    defaultUnit: e.unit,
  };
  return {
    key: `hist-${e.id}-${Date.now()}`,
    input: e.name,
    food,
    name: e.name,
    quantity: e.quantity,
    unit: e.unit,
    grams,
    macros: { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, fiber: e.fiber },
    confidence: 'high',
  };
}

export default function LogFood() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: MealSlot; date?: string }>();
  const session = useAuth((s) => s.session);
  const inputRef = useRef<TextInput>(null);

  const [slot, setSlot] = useState<MealSlot>(params.slot ?? defaultSlot());
  const [slotTouched, setSlotTouched] = useState(!!params.slot);
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [edits, setEdits] = useState<Record<string, ParsedItem | null>>({});
  const [extraItems, setExtraItems] = useState<ParsedItem[]>([]);
  const [ai, setAi] = useState<{ text: string; items: ParsedItem[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const customFoods = useQuery(['custom_foods'], listCustomFoods);
  const frequent = useQuery(['log_entries'], () => frequentFoods(10));
  const extraFoods = useMemo<Food[]>(
    () =>
      customFoods.map((c) => ({
        id: `custom:${c.id}`,
        name: c.name,
        aliases: [],
        per100: { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, fiber: c.fiber },
        units: (c.servingName && c.servingGrams ? { [c.servingName]: c.servingGrams, serving: c.servingGrams } : {}) as Record<string, number>,
        defaultUnit: c.servingName && c.servingGrams ? c.servingName : 'g',
      })),
    [customFoods],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  const parsed = useMemo(() => parseMeal(debounced, extraFoods), [debounced, extraFoods]);

  useEffect(() => {
    if (!slotTouched && parsed.meal) setSlot(parsed.meal);
  }, [parsed.meal, slotTouched]);

  const baseItems = ai && ai.text === debounced ? ai.items : parsed.items;
  const items = [
    ...baseItems
      .map((i, idx) => {
        const editKey = `${i.input}#${idx}`;
        return editKey in edits ? edits[editKey] : { ...i, key: editKey };
      })
      .filter((i): i is ParsedItem => i != null),
    ...extraItems,
  ];

  const totals = sumMacros(items);
  const hasUnknown = items.some((i) => i.confidence === 'none' && i.macros.kcal === 0);
  const canSave = items.length > 0 && !hasUnknown;
  const canUseAi = cloudEnabled && session != null;

  const updateItem = (item: ParsedItem, next: ParsedItem | null) => {
    if (extraItems.some((e) => e.key === item.key)) {
      setExtraItems((list) => (next ? list.map((e) => (e.key === item.key ? next : e)) : list.filter((e) => e.key !== item.key)));
    } else {
      setEdits((m) => ({ ...m, [item.key]: next }));
    }
  };

  const runAi = async () => {
    if (!text.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseWithAi(text, extraFoods);
      setDebounced(text);
      setEdits({});
      setAi({ text, items: result.items });
      if (!slotTouched && result.meal) setSlot(result.meal);
      haptic.success();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI is unavailable right now.');
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => {
    const date = params.date ?? dateKey();
    const entries: NewLogEntry[] = items.map((i) => ({
      dateKey: date,
      mealSlot: slot,
      foodRef: i.food?.id ?? null,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      grams: i.grams || null,
      kcal: i.macros.kcal,
      protein: i.macros.protein,
      carbs: i.macros.carbs,
      fat: i.macros.fat,
      fiber: i.macros.fiber,
      source: !i.food ? 'custom' : i.food.id.startsWith('ai:') ? 'ai' : i.food.id.startsWith('custom:') ? 'custom' : 'local',
      rawInput: text.trim() || null,
    }));
    addLogEntries(entries);
    haptic.success();
    toast(`Added ${Math.round(totals.kcal)} kcal to ${MEAL_SLOTS.find((m) => m.id === slot)!.title}`);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Log food</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} feedback="selection" style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>
        <SegmentedControl<MealSlot>
          value={slot}
          onChange={(s) => {
            setSlot(s);
            setSlotTouched(true);
          }}
          segments={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.title }))}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 160 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (ai && t !== ai.text) setAi(null);
            }}
            autoFocus
            multiline
            placeholder="Describe what you ate, e.g. 2 eggs, 2 slices brown bread and a banana"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            style={[TYPE.title3, { fontFamily: TYPE.body.fontFamily, color: colors.text, minHeight: 88, textAlignVertical: 'top' }]}
          />
          <View style={styles.inputActions}>
            <Text variant="footnote" tone="tertiary" style={{ flex: 1 }}>
              {canUseAi ? 'Matched offline as you type.' : 'Matched offline. Sign in to analyze with AI.'}
            </Text>
            {canUseAi && (
              <Button title={ai ? 'AI applied' : 'Analyze with AI'} icon="sparkles" size="sm" variant="tinted" full={false} loading={aiLoading} disabled={!text.trim() || !!ai} onPress={runAi} />
            )}
          </View>
        </View>

        {text.trim() === '' && extraItems.length === 0 && frequent.length > 0 && (
          <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
            <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 4 }}>
              FREQUENT
            </Text>
            <View style={styles.chips}>
              {frequent.map((e) => (
                <Chip key={e.id} label={e.name} icon="plus" onPress={() => setExtraItems((list) => [...list, entryToItem(e)])} />
              ))}
            </View>
          </Animated.View>
        )}

        <View style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
          {items.map((item) => (
            <ItemRow key={item.key} item={item} onChange={(next) => updateItem(item, next)} onRemove={() => updateItem(item, null)} />
          ))}
        </View>
      </ScrollView>

      {items.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}
        >
          <View style={styles.totals}>
            <Text variant="title3" tabular>{`${Math.round(totals.kcal)} kcal`}</Text>
            <MacroInline macros={totals} showKcal={false} />
          </View>
          <Button
            title={hasUnknown ? 'Enter calories for unknown items' : `Add to ${MEAL_SLOTS.find((m) => m.id === slot)!.title}`}
            onPress={save}
            disabled={!canSave}
          />
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACE.lg, gap: SPACE.md, paddingBottom: SPACE.sm },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  inputCard: { borderRadius: RADIUS.xl, padding: SPACE.lg, gap: SPACE.md },
  inputActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  item: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  editor: { borderTopWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, gap: SPACE.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stepButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, textAlign: 'center', borderRadius: RADIUS.md, height: 48, paddingVertical: 0 },
  manualGrid: { flexDirection: 'row', gap: SPACE.sm },
  manualInput: { borderRadius: RADIUS.sm, height: 44, paddingHorizontal: 10, paddingVertical: 0 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  totals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
