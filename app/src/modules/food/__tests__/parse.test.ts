import { FOODS } from '../foods';
import { extractQuantity, matchFood, parseMeal, withQuantity } from '../parse';

const ids = (text: string) => parseMeal(text).items.map((i) => i.food?.id ?? null);

describe('food data', () => {
  it('has unique ids and sane macros', () => {
    const seen = new Set<string>();
    for (const f of FOODS) {
      expect(seen.has(f.id)).toBe(false);
      seen.add(f.id);
      const fromMacros = f.per100.protein * 4 + f.per100.carbs * 4 + f.per100.fat * 9;
      // Allow for fiber, alcohol and rounding.
      if (!['beer', 'wine'].includes(f.id)) {
        expect(Math.abs(fromMacros - f.per100.kcal) / Math.max(f.per100.kcal, 40)).toBeLessThan(0.25);
      }
      expect(f.units[f.defaultUnit] ?? 1).toBeGreaterThan(0);
    }
  });
});

describe('extractQuantity', () => {
  it('reads leading numbers and units', () => {
    expect(extractQuantity('200g chicken breast')).toEqual({ quantity: 200, unit: 'g', nameTokens: ['chicken', 'breast'] });
    expect(extractQuantity('1 katori dal')).toEqual({ quantity: 1, unit: 'katori', nameTokens: ['dal'] });
    expect(extractQuantity('half a cup of rice')).toEqual({ quantity: 0.5, unit: 'cup', nameTokens: ['rice'] });
    expect(extractQuantity('1 1/2 scoops whey')).toEqual({ quantity: 1.5, unit: 'scoop', nameTokens: ['whey'] });
  });

  it('reads trailing quantities', () => {
    expect(extractQuantity('chicken breast 150 g')).toEqual({ quantity: 150, unit: 'g', nameTokens: ['chicken', 'breast'] });
    expect(extractQuantity('eggs x3')).toEqual({ quantity: 3, unit: null, nameTokens: ['eggs'] });
  });

  it('reads size words', () => {
    expect(extractQuantity('2 large eggs')).toEqual({ quantity: 2, unit: 'large', nameTokens: ['eggs'] });
  });

  it('averages ranges', () => {
    expect(extractQuantity('2-3 rotis').quantity).toBe(2.5);
  });
});

describe('matchFood', () => {
  it('prefers specific matches', () => {
    expect(matchFood('chicken breast')?.food.id).toBe('chicken_breast_cooked');
    expect(matchFood('raw chicken breast')?.food.id).toBe('chicken_breast_raw');
    expect(matchFood('greek yogurt')?.food.id).toBe('greek_yogurt');
    expect(matchFood('yogurt')?.food.id).toBe('curd');
    expect(matchFood('masala dosa')?.food.id).toBe('masala_dosa');
    expect(matchFood('brown bread')?.food.id).toBe('bread_brown');
  });

  it('handles plurals', () => {
    expect(matchFood('rotis')?.food.id).toBe('roti');
    expect(matchFood('potatoes')?.food.id).toBe('potato_boiled');
  });

  it('returns null for unknown food', () => {
    expect(matchFood('dragon fruit smoothie bowl')).toBeNull();
  });
});

describe('parseMeal', () => {
  it('parses a typical Indian meal', () => {
    const { items } = parseMeal('200g chicken breast, 1 katori dal, 2 rotis with ghee, 1 scoop whey');
    expect(items.map((i) => i.food?.id)).toEqual(['chicken_breast_cooked', 'dal', 'roti', 'ghee', 'whey']);
    expect(items[0].grams).toBe(200);
    expect(items[0].macros.protein).toBeCloseTo(62);
    expect(items[2].grams).toBe(80);
    expect(items[3].unit).toBe('tsp');
    expect(items[4].macros.protein).toBeCloseTo(24);
  });

  it('detects the meal and strips filler', () => {
    const r = parseMeal('For breakfast I had 3 eggs and 2 slices of brown bread');
    expect(r.meal).toBe('breakfast');
    expect(r.items.map((i) => i.food?.id)).toEqual(['egg', 'bread_brown']);
    expect(r.items[0].grams).toBe(150);
    expect(r.items[1].grams).toBe(56);
  });

  it('uses grams for large bare numbers', () => {
    const [item] = parseMeal('paneer 100').items;
    expect(item.unit).toBe('g');
    expect(item.macros.kcal).toBeCloseTo(265);
  });

  it('uses ml for liquids', () => {
    const [item] = parseMeal('300 milk').items;
    expect(item.unit).toBe('ml');
    expect(item.grams).toBe(300);
  });

  it('keeps unknown items with zero macros', () => {
    const { items } = parseMeal('1 dragon fruit smoothie bowl, banana');
    expect(ids('1 dragon fruit smoothie bowl, banana')).toEqual([null, 'banana']);
    expect(items[0].confidence).toBe('none');
    expect(items[0].macros.kcal).toBe(0);
  });

  it('recalculates on edit', () => {
    const [item] = parseMeal('1 banana').items;
    const edited = withQuantity(item, 2, 'piece');
    expect(edited.grams).toBe(236);
    expect(edited.macros.kcal).toBeCloseTo(210, 0);
  });
});
