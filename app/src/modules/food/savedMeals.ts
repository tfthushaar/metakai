import { getDb, newId, notify, nowIso } from '../../core/db/database';
import type { NewLogEntry } from '../../core/db/repo';

export type SavedMealItem = Omit<NewLogEntry, 'dateKey' | 'mealSlot' | 'rawInput'>;

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  kcal: number;
}

export function listSavedMeals(): SavedMeal[] {
  return getDb()
    .getAllSync<{ id: string; name: string; items: string }>('SELECT id, name, items FROM saved_meals WHERE deleted_at IS NULL ORDER BY name')
    .map((r) => {
      const items = JSON.parse(r.items) as SavedMealItem[];
      return { id: r.id, name: r.name, items, kcal: items.reduce((s, i) => s + i.kcal, 0) };
    });
}

export function saveMeal(name: string, items: SavedMealItem[]) {
  const now = nowIso();
  getDb().runSync('INSERT INTO saved_meals (id, name, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    newId(),
    name.trim(),
    JSON.stringify(items),
    now,
    now,
  ]);
  notify('saved_meals');
}

export function deleteSavedMeal(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE saved_meals SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('saved_meals');
}
