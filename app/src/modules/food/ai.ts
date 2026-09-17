import Storage from 'expo-sqlite/kv-store';

import { hasAiKey } from '../../core/aiKey';
import type { Food } from './foods';
import { routeChat } from '../../core/aiRouter';
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

const SYSTEM = `You convert meal descriptions into food items with nutrition estimates.
Rules:
- One item per distinct food. Split "2 rotis with ghee" into roti and ghee.
- quantity and unit as the user said them (units like g, ml, piece, cup, katori, bowl, plate, tbsp, tsp, scoop, slice, glass).
- grams: your best estimate of total edible grams (ml for drinks). Indian katori ≈ 150 g, roti ≈ 40 g.
- Assume cooked weight for meat, rice and dal unless the user says raw.
- Include cooking fat only when the user mentions it or the dish is fried.
- kcal, protein, carbs, fat, fiber: totals for the whole item, based on USDA / IFCT typical values.
- meal: breakfast, lunch, dinner, snacks, or null if not stated.
- Never invent foods the user did not mention.`;

const NUM = { type: 'number' };
const SCHEMA = {
  type: 'object',
  properties: {
    meal: { type: 'string', nullable: true, enum: ['breakfast', 'lunch', 'dinner', 'snacks'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, quantity: NUM, unit: { type: 'string' }, grams: NUM, kcal: NUM, protein: NUM, carbs: NUM, fat: NUM, fiber: NUM },
        required: ['name', 'quantity', 'unit', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
      },
    },
  },
  required: ['items'],
};

function sanitize(raw: { meal?: string | null; items?: Partial<AiItem>[] }): { items: AiItem[]; meal: MealHint } {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const items = (raw.items ?? [])
    .filter((i) => typeof i.name === 'string' && i.name.trim())
    .slice(0, 30)
    .map((i) => ({
      name: String(i.name).trim(),
      quantity: num(i.quantity) || 1,
      unit: typeof i.unit === 'string' && i.unit ? i.unit : 'serving',
      grams: num(i.grams),
      kcal: num(i.kcal),
      protein: num(i.protein),
      carbs: num(i.carbs),
      fat: num(i.fat),
      fiber: num(i.fiber),
    }));
  const meal = (['breakfast', 'lunch', 'dinner', 'snacks'].includes(raw.meal ?? '') ? raw.meal : null) as MealHint;
  return { items, meal };
}

const SHAPE_HINT = '{"meal": "breakfast"|"lunch"|"dinner"|"snacks"|null, "items": [{"name","quantity","unit","grams","kcal","protein","carbs","fat","fiber"}]}';

/** Recent answers, so re-analysing the same text never spends quota. */
const CACHE_KEY = 'metakai.aiCache';
const CACHE_SIZE = 150;
type Cached = { items: AiItem[]; meal: MealHint; at: number };
const cacheKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

function readCache(): Record<string, Cached> {
  try {
    return JSON.parse(Storage.getItemSync(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(text: string, value: Omit<Cached, 'at'>) {
  const cache = readCache();
  cache[cacheKey(text)] = { ...value, at: Date.now() };
  const kept = Object.entries(cache)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_SIZE);
  try {
    Storage.setItemSync(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Cache is best-effort.
  }
}

async function viaOwnKeys(text: string) {
  const raw = await routeChat({ system: SYSTEM, user: text.slice(0, 1000), schema: SCHEMA, shapeHint: SHAPE_HINT });
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    throw new Error('AI returned an unreadable answer. Try rephrasing.');
  }
}

/**
 * AI reads the text; the local food database supplies numbers wherever it knows the food.
 * AI macro estimates are only used for foods the database does not have.
 */
export async function parseWithAi(text: string, extraFoods: Food[] = []): Promise<{ items: ParsedItem[]; meal: MealHint }> {
  const cached = readCache()[cacheKey(text)];
  const data = cached ?? (await viaOwnKeys(text));
  if (!cached && data.items.length) writeCache(text, data);

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
