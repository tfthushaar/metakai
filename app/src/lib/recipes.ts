/**
 * Recipe ideas from the ingredients someone already has, aimed at what is left of their day's
 * targets. Only the ingredient list and a few rounded numbers are sent to the model.
 */

export interface RecipeContext {
  goal: string;
  ingredients: string[];
  /** What is left of today's targets. */
  remaining: { kcal: number; protein: number; carbs: number; fat: number };
  targetKcal: number;
  targetProtein: number;
  mealSlot: string;
  dietaryPrefs: string[];
  /** Ingredients the model may add, at most two per recipe. */
  allowExtras: boolean;
}

export interface Recipe {
  title: string;
  minutes: number;
  servings: number;
  uses: string[];
  missing: string[];
  steps: string[];
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
}

export const RECIPE_SYSTEM = `You suggest simple, realistic recipes from the ingredients someone already has.
Rules:
- Use mainly the listed ingredients. Basics like water, salt, pepper, oil and common spices are always assumed available and never counted as missing.
- Give 3 recipes, each with at most 6 steps. Each step is one short sentence.
- Aim each serving near the remaining calories and protein given, and respect every dietary preference. Never suggest a food the person excludes.
- perServing numbers are your best estimate for one serving, in grams for macros.
- "uses" lists the person's ingredients you used. "missing" lists anything else the recipe needs.
- Keep titles under 40 characters. No markdown, no emojis, no commentary outside the JSON.`;

export const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          minutes: { type: 'number' },
          servings: { type: 'number' },
          uses: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          perServing: {
            type: 'object',
            properties: { kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' } },
            required: ['kcal', 'protein', 'carbs', 'fat'],
          },
        },
        required: ['title', 'minutes', 'servings', 'uses', 'missing', 'steps', 'perServing'],
      },
    },
  },
  required: ['recipes'],
};

export const RECIPE_SHAPE =
  '{"recipes": [{"title": string, "minutes": number, "servings": number, "uses": [string], "missing": [string], "steps": [string], "perServing": {"kcal": number, "protein": number, "carbs": number, "fat": number}}]}';

export const INGREDIENTS_SYSTEM = `You list the food ingredients you can see in the photos.
Rules:
- Only foods and drinks, one entry each, lower case, no brands, no quantities, no packaging.
- Use the plainest name, for example "chicken breast", "tomato", "greek yogurt".
- If you cannot identify something, leave it out. Return an empty list if there is no food.`;

export const INGREDIENTS_SCHEMA = { type: 'object', properties: { ingredients: { type: 'array', items: { type: 'string' } } }, required: ['ingredients'] };
export const INGREDIENTS_SHAPE = '{"ingredients": [string]}';

/** The compact payload sent with a recipe request. */
export function recipePayload(c: RecipeContext): string {
  return JSON.stringify({
    goal: c.goal,
    meal: c.mealSlot,
    ingredients: c.ingredients,
    remainingToday: { kcal: Math.round(c.remaining.kcal), proteinG: Math.round(c.remaining.protein), carbsG: Math.round(c.remaining.carbs), fatG: Math.round(c.remaining.fat) },
    dailyTargets: { kcal: c.targetKcal, proteinG: c.targetProtein },
    dietaryPreferences: c.dietaryPrefs,
    mayAddIngredients: c.allowExtras ? 'at most 2 easy extras per recipe' : 'none, use only what is listed',
  });
}

const clean = (v: unknown, max: number): string => {
  const text = typeof v === 'string' ? v.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const list = (v: unknown, max: number, maxLength = 40): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => clean(x, maxLength))
    .filter(Boolean)
    .slice(0, max);

const num = (v: unknown, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n)) : 0;
};

function parse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

/** Parses and cleans the model's recipes. Recipes without food values are dropped. */
export function parseRecipes(raw: string): Recipe[] {
  const data = parse(raw);
  if (!data) return [];
  return (Array.isArray(data.recipes) ? data.recipes : [])
    .map((r: Record<string, unknown>) => {
      const macros = (r?.perServing ?? {}) as Record<string, unknown>;
      return {
        title: clean(r?.title, 40),
        minutes: num(r?.minutes, 240),
        servings: Math.max(1, num(r?.servings, 12)),
        uses: list(r?.uses, 15),
        missing: list(r?.missing, 6),
        steps: list(r?.steps, 6, 200),
        perServing: { kcal: num(macros.kcal, 2000), protein: num(macros.protein, 200), carbs: num(macros.carbs, 300), fat: num(macros.fat, 200) },
      };
    })
    .filter((r: Recipe) => r.title && r.steps.length > 0 && r.perServing.kcal > 0)
    .slice(0, 3);
}

/** Parses the ingredient names read from photos. */
export function parseIngredients(raw: string): string[] {
  const data = parse(raw);
  if (!data) return [];
  return [...new Set(list(data.ingredients, 25, 30).map((i) => i.toLowerCase()))];
}

/** Adds an ingredient to a list, trimmed and without duplicates. */
export function addIngredient(list: string[], name: string, max = 40): string[] {
  const value = clean(name, 30).toLowerCase();
  if (!value || list.includes(value)) return list;
  return [...list, value].slice(-max);
}
