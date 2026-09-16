import { create } from 'zustand';

import { addCustomFood, listCustomFoods, type CustomFood } from '../../core/db/repo';

/** Hands a scanned food back to the screen that opened the scanner. */
export const useScanHandoff = create<{ onFood: ((food: CustomFood) => void) | null; open: (cb: (food: CustomFood) => void) => void; clear: () => void }>(
  (set) => ({
    onFood: null,
    open: (onFood) => set({ onFood }),
    clear: () => set({ onFood: null }),
  }),
);

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Finds a packaged food by barcode: saved foods first, then Open Food Facts (free, no key). */
export async function lookupBarcode(code: string): Promise<CustomFood | null> {
  const saved = listCustomFoods().find((f) => f.barcode === code);
  if (saved) return saved;

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,serving_quantity,serving_size,nutriments`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Metakai/0.4 (https://github.com/tfthushaar/metakai)' } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Food database is unavailable. Try again shortly.');
  }
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  const p = data.product;
  if (data.status !== 1 || !p) return null;

  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
  const name = [p.brands?.split(',')[0]?.trim(), p.product_name_en || p.product_name].filter(Boolean).join(' ') || `Barcode ${code}`;
  const servingGrams = num(p.serving_quantity) || null;

  if (!kcal && !num(n.proteins_100g) && !num(n.carbohydrates_100g)) return null;

  return addCustomFood({
    name,
    kcal: Math.round(kcal),
    protein: num(n.proteins_100g),
    carbs: num(n.carbohydrates_100g),
    fat: num(n.fat_100g),
    fiber: num(n.fiber_100g),
    servingName: servingGrams ? 'serving' : null,
    servingGrams,
    barcode: code,
  });
}
