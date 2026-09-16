import { useAuth } from '../../core/auth/auth';
import { supabase } from '../../core/auth/supabase';
import type { Food } from './foods';
import { matchFood, resolveItem, withQuantity, type MealHint, type ParsedItem } from './parse';

interface AiItem {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const aiAvailable = () => supabase != null && useAuth.getState().session != null;

/**
 * AI reads the text; the local food database supplies numbers wherever it knows the food.
 * AI macro estimates are only used for foods the database does not have.
 */
export async function parseWithAi(text: string, extraFoods: Food[] = []): Promise<{ items: ParsedItem[]; meal: MealHint }> {
  if (!supabase) throw new Error('Cloud features are not configured.');
  const { data, error } = await supabase.functions.invoke<{ items: AiItem[]; meal: MealHint; error?: string }>('parse-food', {
    body: { text },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context ? await context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  if (!data) throw new Error('No response from AI.');

  const items = data.items.map((ai): ParsedItem => {
    const match = matchFood(ai.name, extraFoods);
    if (match && match.score >= 0.7 && ai.grams > 0) {
      const byGrams = resolveItem(ai.name, match.food, ai.grams, 'g', match.score);
      const unitGrams = match.food.units[ai.unit];
      if (unitGrams && Math.abs(unitGrams * ai.quantity - ai.grams) / ai.grams < 0.35) {
        return withQuantity(byGrams, ai.quantity, ai.unit);
      }
      return byGrams;
    }

    const grams = ai.grams > 0 ? ai.grams : 100;
    const k = 100 / grams;
    const food: Food = {
      id: `ai:${ai.name.toLowerCase()}`,
      name: ai.name.charAt(0).toUpperCase() + ai.name.slice(1),
      aliases: [],
      per100: { kcal: ai.kcal * k, protein: ai.protein * k, carbs: ai.carbs * k, fat: ai.fat * k, fiber: ai.fiber * k },
      units: { [ai.unit]: grams / Math.max(ai.quantity, 0.01) },
      defaultUnit: ai.unit,
    };
    return { ...resolveItem(ai.name, food, ai.quantity, ai.unit, 0.6), confidence: 'low' };
  });

  return { items, meal: data.meal };
}
