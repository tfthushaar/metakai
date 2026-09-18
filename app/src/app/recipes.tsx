import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { hasAiKey, useAiKeys } from '../core/aiKey';
import { AiUnavailable, routeChat } from '../core/aiRouter';
import { addLogEntries, getProfile, listLog, MEAL_SLOTS, type MealSlot } from '../core/db/repo';
import { useQuery } from '../core/db/useQuery';
import { useBody } from '../core/goals/useBody';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { dateKey } from '../lib/dates';
import { GOALS } from '../lib/goals';
import {
  addIngredient,
  INGREDIENTS_SCHEMA,
  INGREDIENTS_SHAPE,
  INGREDIENTS_SYSTEM,
  parseIngredients,
  parseRecipes,
  RECIPE_SCHEMA,
  RECIPE_SHAPE,
  RECIPE_SYSTEM,
  recipePayload,
  type Recipe,
} from '../lib/recipes';
import { sumMacros } from '../modules/food/parse';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

function slotNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18) return 'snacks';
  return 'dinner';
}

/** Photos are sent as small JPEGs; the model only needs to recognise the food. */
async function photoBase64(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 768 }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error('Could not read that photo.');
  return saved.base64;
}

function RecipeCard({ recipe, onLog }: { recipe: Recipe; onLog: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const m = recipe.perServing;
  return (
    <Card style={{ marginTop: SPACE.md }}>
      <PressableScale scaleTo={0.995} feedback="selection" onPress={() => setOpen((v) => !v)}>
        <View style={styles.titleRow}>
          <Text variant="headline" style={{ flex: 1 }}>
            {recipe.title}
          </Text>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={18} color={colors.textTertiary} />
        </View>
        <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
          {`${recipe.minutes} min · ${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'} · ${m.kcal} kcal · P ${m.protein} · C ${m.carbs} · F ${m.fat}`}
        </Text>
        {recipe.missing.length > 0 && (
          <Text variant="caption" tone="warning" style={{ marginTop: 4 }}>
            {`Also needs: ${recipe.missing.join(', ')}`}
          </Text>
        )}
      </PressableScale>

      {open && (
        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          {recipe.steps.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text variant="footnote" tone="tertiary" tabular style={{ width: 18 }}>
                {i + 1}
              </Text>
              <Text variant="subhead" style={{ flex: 1 }}>
                {step}
              </Text>
            </View>
          ))}
          <Button title="Log one serving" size="md" variant="gray" icon="plus" onPress={onLog} />
        </View>
      )}
    </Card>
  );
}

export default function Recipes() {
  const { colors } = useTheme();
  const keys = useAiKeys();
  const pantry = useSettings((s) => s.pantry);
  const setSettings = useSettings((s) => s.set);
  const { targets, phase } = useBody();
  const profile = useQuery(['profile'], getProfile);
  const today = dateKey();
  const log = useQuery(['log_entries'], () => listLog(today), [today]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'photo' | 'ideas' | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eaten = sumMacros(log);
  const setPantry = (next: string[]) => setSettings({ pantry: next });

  const add = () => {
    const next = addIngredient(pantry, text);
    if (next !== pantry) haptic.selection();
    setPantry(next);
    setText('');
  };

  const scan = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow the camera to read ingredients from a photo.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (shot.canceled || !shot.assets[0]) return;
    setBusy('photo');
    try {
      const image = await photoBase64(shot.assets[0].uri);
      const raw = await routeChat({ system: INGREDIENTS_SYSTEM, user: 'List the ingredients in this photo.', schema: INGREDIENTS_SCHEMA, shapeHint: INGREDIENTS_SHAPE, images: [image] });
      const found = parseIngredients(raw);
      if (found.length === 0) {
        setError('No ingredients were recognised in that photo. Try a clearer shot or add them by hand.');
        return;
      }
      setPantry(found.reduce((acc, name) => addIngredient(acc, name), pantry));
      haptic.success();
      toast(`Added ${found.length} ${found.length === 1 ? 'ingredient' : 'ingredients'}`);
    } catch (e) {
      setError(e instanceof AiUnavailable || e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (!targets) return;
    setBusy('ideas');
    setError(null);
    try {
      const raw = await routeChat({
        system: RECIPE_SYSTEM,
        user: recipePayload({
          goal: phase ? GOALS[phase.goalType].title : 'General fitness',
          ingredients: pantry,
          remaining: {
            kcal: Math.max(0, targets.kcal - eaten.kcal),
            protein: Math.max(0, targets.protein - eaten.protein),
            carbs: Math.max(0, targets.carbs - eaten.carbs),
            fat: Math.max(0, targets.fat - eaten.fat),
          },
          targetKcal: targets.kcal,
          targetProtein: targets.protein,
          mealSlot: slotNow(),
          dietaryPrefs: profile?.dietaryPrefs ?? [],
          allowExtras: true,
        }),
        schema: RECIPE_SCHEMA,
        shapeHint: RECIPE_SHAPE,
        temperature: 0.6,
      });
      const parsed = parseRecipes(raw);
      if (parsed.length === 0) throw new Error('The answer couldn’t be used. Try again.');
      setRecipes(parsed);
      haptic.success();
    } catch (e) {
      setError(e instanceof AiUnavailable || e instanceof Error ? e.message : 'Could not get recipe ideas.');
    } finally {
      setBusy(null);
    }
  };

  const logServing = (recipe: Recipe) => {
    const slot = slotNow();
    addLogEntries([
      {
        dateKey: today,
        mealSlot: slot,
        foodRef: null,
        name: recipe.title,
        quantity: 1,
        unit: 'serving',
        grams: null,
        kcal: recipe.perServing.kcal,
        protein: recipe.perServing.protein,
        carbs: recipe.perServing.carbs,
        fat: recipe.perServing.fat,
        fiber: 0,
        source: 'ai',
        rawInput: null,
      },
    ]);
    haptic.success();
    toast(`Logged to ${MEAL_SLOTS.find((s) => s.id === slot)!.title.toLowerCase()}`);
  };

  return (
    <Screen title="Recipe ideas" subtitle="From what you already have" back>
      <Card>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <TextField value={text} onChangeText={setText} placeholder="Add an ingredient" autoCapitalize="none" returnKeyType="done" onSubmitEditing={add} />
          </View>
          <Button title="Add" full={false} size="md" onPress={add} disabled={!text.trim()} />
        </View>
        <View style={{ marginTop: SPACE.md }}>
          <Button title={busy === 'photo' ? 'Reading photo…' : 'Scan ingredients'} variant="gray" size="md" icon="camera" loading={busy === 'photo'} onPress={scan} />
        </View>
        {pantry.length > 0 && (
          <View style={styles.chips}>
            {pantry.map((item) => (
              <Chip key={item} label={item} icon="close" onPress={() => setPantry(pantry.filter((i) => i !== item))} />
            ))}
          </View>
        )}
        {pantry.length > 0 && (
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm }}>
            Tap an ingredient to remove it.
          </Text>
        )}
      </Card>

      {error && (
        <Text variant="footnote" tone="danger" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
          {error}
        </Text>
      )}

      <View style={{ marginTop: SPACE.lg }}>
        {hasAiKey(keys) ? (
          <Button title={recipes ? 'New ideas' : 'Get recipe ideas'} icon="sparkles" loading={busy === 'ideas'} disabled={pantry.length === 0 || !targets} onPress={suggest} />
        ) : (
          <Card>
            <Text variant="headline">Add an AI key</Text>
            <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
              Recipe ideas use your own free Gemini or Groq key. Only your ingredients and what is left of today’s targets are sent.
            </Text>
          </Card>
        )}
        {!targets && (
          <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: SPACE.sm }}>
            Set a goal first so recipes can match your targets.
          </Text>
        )}
      </View>

      {busy === 'ideas' && <ActivityIndicator style={{ marginTop: SPACE.xl }} color={colors.textSecondary} />}

      {recipes && recipes.length > 0 && (
        <>
          <SectionHeader title="Ideas for now" />
          {recipes.map((r) => (
            <RecipeCard key={r.title} recipe={r} onLog={() => logServing(r)} />
          ))}
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
            Nutrition is the model’s estimate. Check the numbers if they matter to you.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  step: { flexDirection: 'row', gap: SPACE.sm, borderRadius: RADIUS.sm },
});
