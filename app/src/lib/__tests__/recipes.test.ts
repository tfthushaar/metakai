import { addIngredient, parseIngredients, parseRecipes, recipePayload } from '../recipes';

describe('recipes', () => {
  it('sends ingredients, remaining targets and preferences only', () => {
    const payload = JSON.parse(
      recipePayload({
        goal: 'Cut',
        ingredients: ['chicken breast', 'rice'],
        remaining: { kcal: 843.4, protein: 48.6, carbs: 79.2, fat: 36.1 },
        targetKcal: 2155,
        targetProtein: 162,
        mealSlot: 'dinner',
        dietaryPrefs: ['no beef'],
        allowExtras: true,
      }),
    );
    expect(payload.remainingToday).toEqual({ kcal: 843, proteinG: 49, carbsG: 79, fatG: 36 });
    expect(payload.ingredients).toEqual(['chicken breast', 'rice']);
    expect(payload.dietaryPreferences).toEqual(['no beef']);
    expect(JSON.stringify(payload)).not.toMatch(/weigh|photo|name/i);
  });

  it('cleans recipes and drops unusable ones', () => {
    const recipes = parseRecipes(
      JSON.stringify({
        recipes: [
          {
            title: '**Chicken rice bowl**',
            minutes: 25,
            servings: 2,
            uses: ['chicken breast', 'rice'],
            missing: ['spring onion'],
            steps: ['Cook the rice.', 'Grill the chicken.', 'Combine.', 'Serve.', 'Rest.', 'Garnish.', 'Extra step dropped.'],
            perServing: { kcal: 540.4, protein: 48.2, carbs: 60.9, fat: 12.1 },
          },
          { title: 'No steps', minutes: 10, servings: 1, uses: [], missing: [], steps: [], perServing: { kcal: 300, protein: 20, carbs: 10, fat: 5 } },
          { title: 'No calories', minutes: 10, servings: 1, uses: [], missing: [], steps: ['Mix.'], perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
        ],
      }),
    );
    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe('Chicken rice bowl');
    expect(recipes[0].steps).toHaveLength(6);
    expect(recipes[0].perServing).toEqual({ kcal: 540, protein: 48, carbs: 61, fat: 12 });
    expect(parseRecipes('not json')).toEqual([]);
  });

  it('reads ingredient names from photos without duplicates', () => {
    expect(parseIngredients('{"ingredients": ["Chicken Breast", "chicken breast", "  Rice ", "", 42]}')).toEqual(['chicken breast', 'rice']);
    expect(parseIngredients('nope')).toEqual([]);
  });

  it('adds ingredients without duplicates', () => {
    expect(addIngredient(['rice'], ' Eggs ')).toEqual(['rice', 'eggs']);
    expect(addIngredient(['rice'], 'RICE')).toEqual(['rice']);
    expect(addIngredient(['rice'], '   ')).toEqual(['rice']);
  });
});
