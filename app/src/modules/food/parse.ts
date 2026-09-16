import { DEFAULT_UNIT_GRAMS, FOODS, macrosFor, type Food, type Macros } from './foods';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface ParsedItem {
  key: string;
  input: string;
  food: Food | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  macros: Macros;
  confidence: Confidence;
}

export type MealHint = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | null;

const UNIT_SYNONYMS: Record<string, string> = {
  g: 'g', gm: 'g', gms: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', mls: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml',
  l: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  cup: 'cup', cups: 'cup', mug: 'cup', mugs: 'cup',
  katori: 'katori', katoris: 'katori', katori_s: 'katori', vati: 'katori',
  bowl: 'bowl', bowls: 'bowl',
  plate: 'plate', plates: 'plate',
  glass: 'glass', glasses: 'glass',
  tbsp: 'tbsp', tbs: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  handful: 'handful', handfuls: 'handful', fistful: 'handful',
  slice: 'slice', slices: 'slice',
  scoop: 'scoop', scoops: 'scoop',
  serving: 'serving', servings: 'serving', portion: 'serving', portions: 'serving',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', nos: 'piece', no: 'piece',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  bottle: 'bottle', bottles: 'bottle',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
  cube: 'cube', cubes: 'cube',
  bar: 'bar', bars: 'bar',
  pint: 'pint', pints: 'pint',
  small: 'small', medium: 'medium', large: 'large', big: 'large',
};

const MASS_UNITS = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb']);
const SIZE_UNITS = new Set(['small', 'medium', 'large']);

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25, couple: 2, few: 3,
};

const FILLER = new Set(['of', 'some', 'the', 'my', 'fresh', 'homemade', 'plain', 'x', 'about', 'around', 'approx']);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);

interface Candidate {
  food: Food;
  tokens: string[][];
}

function buildIndex(foods: Food[]): Candidate[] {
  return foods.map((food) => ({
    food,
    tokens: [food.name.replace(/\(.*?\)/g, ' '), ...food.aliases].map(tokenize),
  }));
}

const BUILTIN_INDEX = buildIndex(FOODS);

function scoreTokens(input: string[], alias: string[]): number {
  if (alias.length === 0 || input.length === 0) return 0;
  const inputSet = new Set(input);
  const overlap = alias.filter((t) => inputSet.has(t)).length;
  if (overlap === 0) return 0;
  const precision = overlap / input.length;
  const recall = overlap / alias.length;
  let score = (2 * precision * recall) / (precision + recall);
  if (recall === 1) score += 0.04 * alias.length;
  return score;
}

export function matchFood(name: string, extra: Food[] = []): { food: Food; score: number } | null {
  const input = tokenize(name).filter((t) => !FILLER.has(t));
  if (input.length === 0) return null;
  const index = extra.length ? [...buildIndex(extra), ...BUILTIN_INDEX] : BUILTIN_INDEX;
  const wantsRaw = input.includes('raw');
  let best: { food: Food; score: number } | null = null;
  for (const c of index) {
    let score = Math.max(...c.tokens.map((t) => scoreTokens(input, t)));
    if (score === 0) continue;
    const isRaw = c.food.id.includes('raw');
    if (isRaw && !wantsRaw) score -= 0.15;
    if (!isRaw && wantsRaw && FOODS.some((f) => f.id === c.food.id.replace('cooked', 'raw'))) score -= 0.15;
    if (!best || score > best.score) best = { food: c.food, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

function parseNumberToken(tokens: string[], i: number): { value: number; used: number } | null {
  const t = tokens[i];
  if (t == null) return null;
  const unicode: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  if (unicode[t] != null) return { value: unicode[t], used: 1 };
  if (/^\d+(\.\d+)?$/.test(t)) {
    const next = tokens[i + 1];
    if (next && /^\d+\/\d+$/.test(next)) {
      const [a, b] = next.split('/').map(Number);
      return { value: Number(t) + a / b, used: 2 };
    }
    if (next === '-' || next === 'to') {
      const after = tokens[i + 2];
      if (after && /^\d+(\.\d+)?$/.test(after)) return { value: (Number(t) + Number(after)) / 2, used: 3 };
    }
    return { value: Number(t), used: 1 };
  }
  if (/^\d+\/\d+$/.test(t)) {
    const [a, b] = t.split('/').map(Number);
    return b ? { value: a / b, used: 1 } : null;
  }
  if (NUMBER_WORDS[t] != null) {
    // "half a katori", "a couple of"
    const next = tokens[i + 1];
    if ((t === 'half' || t === 'quarter') && (next === 'a' || next === 'an')) return { value: NUMBER_WORDS[t], used: 2 };
    if (t === 'a' && (next === 'couple' || next === 'few')) return { value: NUMBER_WORDS[next], used: 2 };
    return { value: NUMBER_WORDS[t], used: 1 };
  }
  return null;
}

function rawTokens(segment: string): string[] {
  return segment
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 - $2')
    .replace(/[^a-z0-9./½¼¾\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== '.');
}

interface Quantity {
  quantity: number | null;
  unit: string | null;
  nameTokens: string[];
}

export function extractQuantity(segment: string): Quantity {
  const tokens = rawTokens(segment);
  let quantity: number | null = null;
  let unit: string | null = null;
  let start = 0;
  let end = tokens.length;

  const lead = parseNumberToken(tokens, 0);
  if (lead) {
    quantity = lead.value;
    start = lead.used;
  }
  if (tokens[start] && UNIT_SYNONYMS[tokens[start]]) {
    // Only treat "a"/"an"-less leading words as units when a number preceded them, or they are real units.
    unit = UNIT_SYNONYMS[tokens[start]];
    start += 1;
  }
  while (tokens[start] && (tokens[start] === 'of' || tokens[start] === 'x')) start += 1;

  if (quantity == null) {
    // Trailing forms: "chicken 200 g", "eggs x 3", "rice 2 cups"
    const last = tokens[end - 1];
    const secondLast = tokens[end - 2];
    if (last && UNIT_SYNONYMS[last] && secondLast && parseNumberToken(tokens, end - 2)) {
      quantity = parseNumberToken(tokens, end - 2)!.value;
      unit = UNIT_SYNONYMS[last];
      end -= 2;
    } else if (last && /^\d+(\.\d+)?$/.test(last)) {
      quantity = Number(last);
      end -= 1;
    }
    while (end > start && tokens[end - 1] === 'x') end -= 1;
  }

  // Size words directly before the food name: "2 large eggs"
  if (!unit && tokens[start] && SIZE_UNITS.has(tokens[start])) {
    unit = tokens[start];
    start += 1;
  }

  return { quantity, unit, nameTokens: tokens.slice(start, end).filter((t) => t !== '-' && t !== 'x') };
}

const SPLIT = /[,;\n+&]|\band\b|\bwith\b|\bplus\b/;

const MEAL_PATTERNS: [RegExp, MealHint][] = [
  [/\bbreakfast\b/, 'breakfast'],
  [/\blunch\b/, 'lunch'],
  [/\bdinner\b|\bsupper\b/, 'dinner'],
  [/\bsnacks?\b/, 'snacks'],
];

function cleanInput(text: string): { text: string; meal: MealHint } {
  let t = text.toLowerCase();
  let meal: MealHint = null;
  for (const [re, hint] of MEAL_PATTERNS) {
    if (re.test(t)) {
      meal = hint;
      break;
    }
  }
  t = t
    .replace(/\b(for|at|in)\s+(breakfast|lunch|dinner|supper|snacks?)\b/g, ' ')
    .replace(/^\s*(breakfast|lunch|dinner|supper|snacks?)\s*[:-]?/g, ' ')
    .replace(/\b(i|we)\s+(had|ate|have|drank|eat)\b/g, ' ')
    .replace(/^\s*(had|ate|drank)\b/g, ' ')
    .replace(/\b(today|this morning|tonight|just now)\b/g, ' ');
  return { text: t, meal };
}

function titleCase(tokens: string[]): string {
  const s = tokens.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let keyCounter = 0;

export function resolveItem(input: string, food: Food | null, quantity: number | null, unit: string | null, score = 1): ParsedItem {
  const key = `item-${Date.now()}-${keyCounter++}`;
  let q = quantity ?? 1;
  let u = unit;
  let confidence: Confidence = score >= 0.95 ? 'high' : score >= 0.7 ? 'medium' : 'low';

  if (!food) {
    const grams = u && MASS_UNITS.has(u) ? q * DEFAULT_UNIT_GRAMS[u] : 0;
    return {
      key,
      input,
      food: null,
      name: input,
      quantity: q,
      unit: u ?? 'serving',
      grams,
      macros: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      confidence: 'none',
    };
  }

  if (!u) {
    if (quantity == null) u = food.defaultUnit;
    else if (food.units.piece && food.defaultUnit === 'piece') u = 'piece';
    else if (quantity >= 20) u = food.liquid ? 'ml' : 'g';
    else u = food.defaultUnit;
  }
  if (SIZE_UNITS.has(u) && !food.units[u]) u = 'piece';
  if (u === 'piece' && !food.units.piece) confidence = confidence === 'high' ? 'medium' : 'low';

  const unitGrams = food.units[u] ?? DEFAULT_UNIT_GRAMS[u] ?? DEFAULT_UNIT_GRAMS.serving;
  const grams = q * unitGrams;
  return {
    key,
    input,
    food,
    name: food.name,
    quantity: q,
    unit: u,
    grams,
    macros: macrosFor(food.per100, grams),
    confidence,
  };
}

/** Offline parser: splits a meal description into items and matches each against known foods. */
export function parseMeal(text: string, extraFoods: Food[] = []): { items: ParsedItem[]; meal: MealHint } {
  const { text: cleaned, meal } = cleanInput(text);
  const items: ParsedItem[] = [];
  for (const raw of cleaned.split(SPLIT)) {
    const segment = raw.trim();
    if (!segment) continue;
    const { quantity, unit, nameTokens } = extractQuantity(segment);
    if (nameTokens.length === 0) continue;
    const name = nameTokens.join(' ');
    const match = matchFood(name, extraFoods);
    items.push(
      match
        ? resolveItem(segment, match.food, quantity, unit, match.score)
        : { ...resolveItem(segment, null, quantity, unit), name: titleCase(nameTokens) },
    );
  }
  return { items, meal };
}

/** Recomputes grams and macros after the user edits quantity or unit. */
export function withQuantity(item: ParsedItem, quantity: number, unit: string): ParsedItem {
  if (!item.food) return { ...item, quantity, unit };
  const unitGrams = item.food.units[unit] ?? DEFAULT_UNIT_GRAMS[unit] ?? DEFAULT_UNIT_GRAMS.serving;
  const grams = quantity * unitGrams;
  return { ...item, quantity, unit, grams, macros: macrosFor(item.food.per100, grams) };
}

/** Units that make sense for a food: its own units first, then mass units. */
export function unitOptions(food: Food | null): string[] {
  if (!food) return ['serving', 'g'];
  const own = Object.keys(food.units).filter((u) => !SIZE_UNITS.has(u));
  const base = food.liquid ? ['ml', 'glass', 'cup'] : ['g', 'katori', 'serving'];
  return [...new Set([food.defaultUnit, ...own, ...base])];
}

type MacroSource = { macros: Macros } | Macros;

export function sumMacros(items: MacroSource[]): Macros {
  return items.reduce<Macros>(
    (acc, item) => {
      const i = { macros: 'macros' in item ? item.macros : item };
      return {
      kcal: acc.kcal + i.macros.kcal,
      protein: acc.protein + i.macros.protein,
      carbs: acc.carbs + i.macros.carbs,
      fat: acc.fat + i.macros.fat,
      fiber: acc.fiber + i.macros.fiber,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

const PLURAL: Record<string, string> = {
  piece: 'pieces', slice: 'slices', cup: 'cups', scoop: 'scoops', glass: 'glasses', can: 'cans', bowl: 'bowls',
  plate: 'plates', handful: 'handfuls', serving: 'servings', pack: 'packs', bar: 'bars', bottle: 'bottles', cube: 'cubes', pint: 'pints',
};

/** "2 pieces", "1 katori", "150 g". */
export function formatAmount(quantity: number, unit: string): string {
  const q = Number.isInteger(quantity) ? String(quantity) : String(+quantity.toFixed(2));
  const u = quantity > 1 && PLURAL[unit] ? PLURAL[unit] : unit;
  return `${q} ${u}`;
}
