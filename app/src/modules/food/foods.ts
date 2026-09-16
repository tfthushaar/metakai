/**
 * Built-in reference foods. Values are per 100 g (or 100 ml for drinks), rounded from
 * USDA FoodData Central and typical Indian home recipes. Mixed dishes are estimates.
 */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Food {
  id: string;
  name: string;
  aliases: string[];
  per100: Macros;
  /** Grams for each named unit; overrides the defaults. */
  units: Record<string, number>;
  /** Unit used when no unit is given. */
  defaultUnit: string;
  liquid?: boolean;
}

export const DEFAULT_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  oz: 28.35,
  lb: 453.6,
  cup: 240,
  katori: 150,
  bowl: 250,
  plate: 300,
  glass: 250,
  tbsp: 15,
  tsp: 5,
  handful: 30,
  slice: 30,
  scoop: 30,
  serving: 100,
  piece: 50,
  can: 330,
  bottle: 500,
  pack: 50,
};

type U = Record<string, number>;

function f(
  id: string,
  name: string,
  aliases: string[],
  [kcal, protein, carbs, fat, fiber]: [number, number, number, number, number],
  units: U = {},
  defaultUnit = 'serving',
  liquid = false,
): Food {
  return { id, name, aliases, per100: { kcal, protein, carbs, fat, fiber }, units, defaultUnit, liquid };
}

export const FOODS: Food[] = [
  // Meat, fish, eggs
  f('chicken_breast_cooked', 'Chicken breast (cooked)', ['chicken breast', 'grilled chicken', 'boiled chicken', 'chicken', 'cooked chicken breast'], [165, 31, 0, 3.6, 0], { piece: 170 }, 'serving'),
  f('chicken_breast_raw', 'Chicken breast (raw)', ['raw chicken breast', 'raw chicken'], [120, 22.5, 0, 2.6, 0], { piece: 220 }),
  f('chicken_thigh_cooked', 'Chicken thigh (cooked)', ['chicken thigh', 'chicken thighs'], [179, 24.8, 0, 8.2, 0], { piece: 80 }),
  f('chicken_curry', 'Chicken curry', ['chicken gravy', 'chicken masala'], [150, 13, 5, 9, 1], {}, 'katori'),
  f('butter_chicken', 'Butter chicken', ['murgh makhani'], [190, 13, 6, 13, 1], {}, 'katori'),
  f('tandoori_chicken', 'Tandoori chicken', ['chicken tandoori'], [160, 24, 4, 5, 0.5], { piece: 120 }),
  f('chicken_tikka', 'Chicken tikka', ['tikka'], [150, 24, 3, 4.5, 0.5], { piece: 25 }),
  f('chicken_biryani', 'Chicken biryani', ['biryani'], [180, 9, 22, 6.5, 1], {}, 'plate'),
  f('egg', 'Egg (whole)', ['egg', 'eggs', 'boiled egg', 'whole egg', 'poached egg'], [143, 12.6, 0.7, 9.5, 0], { piece: 50, large: 50, medium: 44, small: 38 }, 'piece'),
  f('egg_white', 'Egg white', ['egg whites'], [52, 10.9, 0.7, 0.2, 0], { piece: 33 }, 'piece'),
  f('omelette', 'Omelette', ['omelet', 'egg omelette'], [154, 10.6, 0.6, 11.7, 0], { piece: 120 }, 'piece'),
  f('egg_bhurji', 'Egg bhurji', ['scrambled eggs', 'anda bhurji'], [180, 11, 3, 14, 0.5], {}, 'katori'),
  f('egg_curry', 'Egg curry', ['anda curry'], [150, 9, 5, 10.5, 1], {}, 'katori'),
  f('salmon_cooked', 'Salmon (cooked)', ['salmon'], [206, 22, 0, 12.4, 0], { piece: 150 }),
  f('tuna_canned', 'Tuna (canned in water)', ['tuna'], [116, 25.5, 0, 0.8, 0], { can: 120 }, 'can'),
  f('white_fish_cooked', 'Fish (white, cooked)', ['fish', 'rohu', 'basa', 'tilapia', 'grilled fish'], [128, 24, 0, 3, 0], { piece: 120 }),
  f('fish_curry', 'Fish curry', ['fish gravy'], [140, 14, 4, 8, 1], {}, 'katori'),
  f('fish_fry', 'Fish fry', ['fried fish'], [200, 20, 6, 10.5, 0.5], { piece: 80 }, 'piece'),
  f('prawns_cooked', 'Prawns (cooked)', ['prawns', 'shrimp'], [99, 24, 0.2, 0.3, 0]),
  f('mutton_cooked', 'Mutton (cooked, lean)', ['mutton', 'goat meat', 'lamb'], [143, 27, 0, 3, 0]),
  f('mutton_curry', 'Mutton curry', ['mutton gravy', 'rogan josh'], [220, 16, 4, 15, 1], {}, 'katori'),
  f('beef_mince_cooked', 'Beef mince (lean, cooked)', ['beef', 'ground beef', 'minced beef'], [217, 26, 0, 11.7, 0]),
  f('turkey_breast', 'Turkey breast (cooked)', ['turkey'], [147, 30, 0, 2, 0]),
  f('chicken_sausage', 'Chicken sausage', ['sausage', 'sausages'], [200, 14, 4, 14, 0], { piece: 45 }, 'piece'),

  // Dairy & vegetarian protein
  f('paneer', 'Paneer', ['cottage cheese indian', 'paneer cubes'], [265, 18.3, 1.2, 20.8, 0], { piece: 20, cube: 15 }),
  f('paneer_bhurji', 'Paneer bhurji', [], [230, 14, 5, 17, 1], {}, 'katori'),
  f('palak_paneer', 'Palak paneer', ['saag paneer'], [150, 7, 5, 11.5, 2], {}, 'katori'),
  f('tofu', 'Tofu', ['tofu cubes'], [76, 8.1, 1.9, 4.8, 0.3]),
  f('soya_chunks', 'Soya chunks (dry)', ['soya chunks', 'soy chunks', 'nutrela', 'meal maker'], [345, 52, 33, 0.5, 13], { cup: 50 }, 'serving'),
  f('whey', 'Whey protein', ['whey', 'protein powder', 'protein shake', 'whey protein'], [400, 80, 10, 5, 0], { scoop: 30 }, 'scoop'),
  f('greek_yogurt', 'Greek yogurt (non-fat)', ['greek yogurt', 'greek yoghurt', 'hung curd'], [59, 10.3, 3.6, 0.4, 0], { cup: 225 }, 'cup'),
  f('curd', 'Curd (dahi)', ['curd', 'dahi', 'yogurt', 'yoghurt', 'plain yogurt'], [61, 3.5, 4.7, 3.3, 0], {}, 'katori'),
  f('milk', 'Milk (toned)', ['milk', 'toned milk', 'whole milk'], [58, 3.1, 4.8, 3, 0], {}, 'glass', true),
  f('milk_full_cream', 'Milk (full cream)', ['full cream milk', 'full fat milk'], [87, 3.2, 4.7, 6.2, 0], {}, 'glass', true),
  f('milk_skim', 'Milk (skimmed)', ['skim milk', 'skimmed milk', 'double toned milk'], [35, 3.4, 5, 0.1, 0], {}, 'glass', true),
  f('soy_milk', 'Soy milk (unsweetened)', ['soy milk', 'soya milk'], [39, 3.3, 2, 2, 0.5], {}, 'glass', true),
  f('almond_milk', 'Almond milk (unsweetened)', ['almond milk'], [15, 0.6, 0.3, 1.2, 0.2], {}, 'glass', true),
  f('cheddar', 'Cheddar cheese', ['cheese', 'cheddar'], [403, 25, 1.3, 33, 0], { slice: 20 }, 'slice'),
  f('cheese_slice', 'Cheese slice (processed)', ['cheese slice', 'cheese slices'], [310, 18, 7, 23, 0], { piece: 20, slice: 20 }, 'slice'),
  f('cottage_cheese', 'Cottage cheese (2%)', ['cottage cheese'], [82, 10.5, 4.8, 2.3, 0], { cup: 225 }, 'cup'),
  f('buttermilk', 'Buttermilk (chaas)', ['buttermilk', 'chaas', 'chhach'], [30, 1.5, 3.5, 1, 0], {}, 'glass', true),
  f('lassi', 'Lassi (sweet)', ['lassi', 'sweet lassi'], [90, 2.5, 14, 2.5, 0], {}, 'glass', true),

  // Grains & breads
  f('rice_white', 'Rice (white, cooked)', ['rice', 'white rice', 'steamed rice', 'boiled rice', 'basmati rice', 'chawal'], [130, 2.7, 28.2, 0.3, 0.4], { cup: 158, katori: 150, bowl: 200, plate: 250 }, 'katori'),
  f('rice_brown', 'Rice (brown, cooked)', ['brown rice'], [123, 2.7, 25.6, 1, 1.6], { cup: 195, katori: 150 }, 'katori'),
  f('jeera_rice', 'Jeera rice', ['jeera rice', 'cumin rice'], [150, 3, 28, 3, 0.8], {}, 'katori'),
  f('veg_biryani', 'Veg biryani', ['vegetable biryani'], [160, 4, 26, 5, 2], {}, 'plate'),
  f('pulao', 'Pulao', ['veg pulao', 'pulav'], [150, 3.5, 25, 4, 1.5], {}, 'katori'),
  f('khichdi', 'Khichdi', ['khichri'], [120, 4.5, 19, 3, 2], {}, 'bowl'),
  f('curd_rice', 'Curd rice', ['dahi chawal', 'thayir sadam'], [130, 3.3, 20, 4, 0.5], {}, 'katori'),
  f('roti', 'Roti / chapati', ['roti', 'chapati', 'chapatti', 'phulka', 'fulka', 'wheat roti'], [245, 8.5, 46, 3, 6], { piece: 40 }, 'piece'),
  f('paratha', 'Paratha (plain)', ['paratha', 'parantha'], [300, 7, 42, 11, 5], { piece: 80 }, 'piece'),
  f('aloo_paratha', 'Aloo paratha', ['aloo parantha', 'potato paratha'], [260, 5.5, 35, 11, 3.5], { piece: 120 }, 'piece'),
  f('naan', 'Naan', ['butter naan', 'garlic naan'], [290, 9, 50, 5.5, 2], { piece: 90 }, 'piece'),
  f('puri', 'Puri', ['poori'], [380, 6, 42, 20, 3], { piece: 25 }, 'piece'),
  f('bread_white', 'Bread (white)', ['bread', 'white bread', 'toast'], [265, 9, 49, 3.2, 2.7], { slice: 25, piece: 25 }, 'slice'),
  f('bread_brown', 'Bread (whole wheat)', ['brown bread', 'whole wheat bread', 'multigrain bread'], [250, 12.5, 43, 3.5, 6], { slice: 28, piece: 28 }, 'slice'),
  f('oats', 'Oats (dry)', ['oats', 'rolled oats', 'porridge oats'], [379, 13.2, 67.7, 6.5, 10], { cup: 80, katori: 50, tbsp: 7 }, 'serving'),
  f('oatmeal_cooked', 'Oatmeal (cooked with water)', ['oatmeal', 'porridge'], [71, 2.5, 12, 1.5, 1.7], {}, 'bowl'),
  f('muesli', 'Muesli', ['granola'], [370, 10, 65, 7, 8], { cup: 85, katori: 50 }, 'serving'),
  f('cornflakes', 'Cornflakes', ['corn flakes', 'cereal'], [357, 7.5, 84, 0.4, 3], { cup: 30, bowl: 40 }, 'bowl'),
  f('poha', 'Poha', ['aval', 'flattened rice'], [130, 2.5, 23, 3.3, 1], { plate: 200 }, 'plate'),
  f('upma', 'Upma', ['rava upma'], [150, 3.5, 22, 5.5, 1.5], { plate: 200 }, 'plate'),
  f('idli', 'Idli', ['idly', 'idlis'], [146, 4.5, 30, 0.7, 1.5], { piece: 40 }, 'piece'),
  f('dosa', 'Dosa (plain)', ['dosa', 'plain dosa', 'dosai'], [165, 4, 26, 5, 1.5], { piece: 80 }, 'piece'),
  f('masala_dosa', 'Masala dosa', [], [180, 3.8, 26, 7, 2], { piece: 180 }, 'piece'),
  f('medu_vada', 'Medu vada', ['vada', 'vadai'], [285, 8, 25, 17, 4], { piece: 40 }, 'piece'),
  f('pasta_cooked', 'Pasta (cooked)', ['pasta', 'spaghetti', 'penne', 'macaroni'], [158, 5.8, 30.9, 0.9, 1.8], { cup: 140, plate: 250 }, 'cup'),
  f('instant_noodles', 'Instant noodles', ['maggi', 'instant noodles', 'ramen', 'noodles'], [440, 9.5, 60, 18, 2.5], { pack: 70, piece: 70 }, 'pack'),
  f('quinoa_cooked', 'Quinoa (cooked)', ['quinoa'], [120, 4.4, 21.3, 1.9, 2.8], { cup: 185, katori: 150 }, 'katori'),

  // Legumes & dals
  f('dal', 'Dal (cooked)', ['dal', 'daal', 'dhal', 'toor dal', 'moong dal', 'masoor dal', 'yellow dal', 'sambar dal'], [100, 5.5, 13, 2.8, 3], {}, 'katori'),
  f('dal_tadka', 'Dal tadka', ['dal fry', 'tadka dal'], [120, 5.5, 13, 5, 3], {}, 'katori'),
  f('dal_makhani', 'Dal makhani', ['maa ki dal'], [140, 5.5, 13, 7.5, 3.5], {}, 'katori'),
  f('rajma', 'Rajma (curry)', ['rajma', 'kidney bean curry', 'rajma masala'], [120, 6, 17, 3, 5], {}, 'katori'),
  f('chole', 'Chole / chana masala', ['chole', 'chana masala', 'chickpea curry', 'chana'], [150, 6.5, 20, 5, 6], {}, 'katori'),
  f('chickpeas_boiled', 'Chickpeas (boiled)', ['boiled chana', 'chickpeas', 'kabuli chana'], [164, 8.9, 27.4, 2.6, 7.6], { cup: 164 }, 'katori'),
  f('roasted_chana', 'Roasted chana', ['roasted chickpeas', 'bhuna chana'], [360, 20, 58, 5.5, 17], {}, 'handful'),
  f('moong_sprouts', 'Moong sprouts', ['sprouts', 'bean sprouts', 'sprouts salad'], [30, 3, 5.9, 0.2, 1.8], { cup: 105 }, 'katori'),
  f('sambar', 'Sambar', ['sambhar'], [56, 2.5, 7.5, 1.8, 2], {}, 'katori'),
  f('rasam', 'Rasam', [], [30, 1, 5, 0.8, 0.5], {}, 'katori'),

  // Nuts & seeds
  f('peanuts', 'Peanuts', ['peanut', 'groundnuts', 'moongphali'], [567, 25.8, 16.1, 49.2, 8.5], {}, 'handful'),
  f('peanut_butter', 'Peanut butter', ['pb'], [597, 22.2, 22.3, 51.4, 5], { tbsp: 16, tsp: 5 }, 'tbsp'),
  f('almonds', 'Almonds', ['almond', 'badam'], [579, 21.2, 21.6, 49.9, 12.5], { piece: 1.2, handful: 25 }, 'handful'),
  f('cashews', 'Cashews', ['cashew', 'kaju'], [553, 18.2, 30.2, 43.9, 3.3], { piece: 1.5, handful: 25 }, 'handful'),
  f('walnuts', 'Walnuts', ['walnut', 'akhrot'], [654, 15.2, 13.7, 65.2, 6.7], { piece: 4, handful: 25 }, 'handful'),
  f('chia_seeds', 'Chia seeds', ['chia'], [486, 16.5, 42, 30.7, 34], { tbsp: 12 }, 'tbsp'),
  f('flax_seeds', 'Flax seeds', ['flaxseed', 'alsi'], [534, 18.3, 28.9, 42.2, 27], { tbsp: 10 }, 'tbsp'),
  f('makhana', 'Makhana (roasted)', ['fox nuts', 'lotus seeds', 'phool makhana'], [332, 15.4, 64.5, 2, 5], { cup: 15, bowl: 30 }, 'bowl'),

  // Vegetables & sabzi
  f('potato_boiled', 'Potato (boiled)', ['potato', 'potatoes', 'aloo', 'boiled potato'], [87, 1.9, 20.1, 0.1, 1.8], { piece: 150, medium: 150, small: 100, large: 250 }, 'piece'),
  f('sweet_potato', 'Sweet potato (baked)', ['sweet potato', 'shakarkandi'], [90, 2, 20.7, 0.2, 3.3], { piece: 130 }, 'piece'),
  f('aloo_sabzi', 'Aloo sabzi', ['potato sabzi', 'aloo bhaji', 'potato curry'], [130, 2, 17, 6, 2], {}, 'katori'),
  f('mixed_veg', 'Mixed veg sabzi', ['sabzi', 'sabji', 'vegetable curry', 'mixed vegetables', 'veg curry'], [91, 2.5, 9, 5, 3], {}, 'katori'),
  f('bhindi', 'Bhindi fry', ['bhindi', 'okra', 'lady finger'], [111, 2, 9, 7.5, 3.5], {}, 'katori'),
  f('broccoli', 'Broccoli', [], [34, 2.8, 6.6, 0.4, 2.6], { cup: 90 }, 'cup'),
  f('spinach', 'Spinach', ['palak'], [23, 2.9, 3.6, 0.4, 2.2], { cup: 30 }, 'cup'),
  f('salad', 'Green salad', ['salad', 'mixed salad', 'cucumber salad'], [20, 1, 3.5, 0.2, 1.5], {}, 'bowl'),
  f('cucumber', 'Cucumber', ['kheera'], [15, 0.7, 3.6, 0.1, 0.5], { piece: 200 }, 'piece'),
  f('tomato', 'Tomato', ['tomatoes'], [18, 0.9, 3.9, 0.2, 1.2], { piece: 120 }, 'piece'),
  f('onion', 'Onion', ['onions', 'pyaz'], [40, 1.1, 9.3, 0.1, 1.7], { piece: 110 }, 'piece'),
  f('carrot', 'Carrot', ['carrots', 'gajar'], [41, 0.9, 9.6, 0.2, 2.8], { piece: 60 }, 'piece'),
  f('sweet_corn', 'Sweet corn (boiled)', ['corn', 'sweet corn', 'bhutta'], [96, 3.4, 21, 1.5, 2.4], { cup: 150, piece: 100 }, 'cup'),
  f('mushroom', 'Mushrooms', ['mushroom'], [22, 3.1, 3.3, 0.3, 1], { cup: 70 }, 'cup'),
  f('green_peas', 'Green peas', ['peas', 'matar'], [81, 5.4, 14.5, 0.4, 5.1], { cup: 145 }, 'katori'),
  f('avocado', 'Avocado', [], [160, 2, 8.5, 14.7, 6.7], { piece: 150 }, 'piece'),

  // Fruit
  f('banana', 'Banana', ['bananas', 'kela'], [89, 1.1, 22.8, 0.3, 2.6], { piece: 118, small: 100, medium: 118, large: 136 }, 'piece'),
  f('apple', 'Apple', ['apples', 'seb'], [52, 0.3, 13.8, 0.2, 2.4], { piece: 180 }, 'piece'),
  f('orange', 'Orange', ['oranges', 'santra'], [47, 0.9, 11.8, 0.1, 2.4], { piece: 140 }, 'piece'),
  f('mango', 'Mango', ['mangoes', 'aam'], [60, 0.8, 15, 0.4, 1.6], { piece: 200, cup: 165 }, 'piece'),
  f('papaya', 'Papaya', ['papita'], [43, 0.5, 10.8, 0.3, 1.7], { cup: 145 }, 'cup'),
  f('watermelon', 'Watermelon', ['tarbooz'], [30, 0.6, 7.6, 0.2, 0.4], { cup: 150, slice: 280 }, 'cup'),
  f('grapes', 'Grapes', ['angoor'], [69, 0.7, 18.1, 0.2, 0.9], { cup: 150 }, 'cup'),
  f('pomegranate', 'Pomegranate', ['anar'], [83, 1.7, 18.7, 1.2, 4], { cup: 175, piece: 280 }, 'cup'),
  f('guava', 'Guava', ['amrood'], [68, 2.6, 14.3, 1, 5.4], { piece: 100 }, 'piece'),
  f('dates', 'Dates', ['date', 'khajur'], [282, 2.5, 75, 0.4, 8], { piece: 10 }, 'piece'),
  f('raisins', 'Raisins', ['kishmish'], [299, 3.1, 79, 0.5, 3.7], { tbsp: 10 }, 'tbsp'),
  f('strawberries', 'Strawberries', ['strawberry', 'berries'], [32, 0.7, 7.7, 0.3, 2], { cup: 150, piece: 12 }, 'cup'),

  // Fats, sugars
  f('ghee', 'Ghee', ['desi ghee'], [900, 0, 0, 100, 0], { tsp: 5, tbsp: 13 }, 'tsp'),
  f('butter', 'Butter', [], [717, 0.9, 0.1, 81, 0], { tsp: 5, tbsp: 14 }, 'tsp'),
  f('oil', 'Cooking oil', ['oil', 'olive oil', 'sunflower oil', 'mustard oil', 'coconut oil', 'vegetable oil'], [884, 0, 0, 100, 0], { tsp: 4.5, tbsp: 13.5 }, 'tsp'),
  f('mayonnaise', 'Mayonnaise', ['mayo'], [680, 1, 0.6, 75, 0], { tbsp: 14 }, 'tbsp'),
  f('cream', 'Cream', ['fresh cream', 'malai'], [340, 2.8, 2.7, 36, 0], { tbsp: 15 }, 'tbsp'),
  f('sugar', 'Sugar', ['cheeni', 'shakkar'], [387, 0, 100, 0, 0], { tsp: 4, tbsp: 12 }, 'tsp'),
  f('honey', 'Honey', ['shahad'], [304, 0.3, 82.4, 0, 0], { tsp: 7, tbsp: 21 }, 'tsp'),
  f('jaggery', 'Jaggery', ['gud', 'gur'], [383, 0.4, 98, 0.1, 0], { tsp: 5, piece: 10 }, 'piece'),

  // Drinks
  f('chai', 'Tea with milk & sugar', ['chai', 'tea', 'milk tea', 'masala chai'], [46, 1.5, 7, 1.3, 0], { cup: 150 }, 'cup', true),
  f('coffee_black', 'Coffee (black)', ['black coffee', 'americano', 'espresso'], [2, 0.3, 0, 0, 0], { cup: 240 }, 'cup', true),
  f('coffee_milk', 'Coffee with milk & sugar', ['coffee', 'filter coffee', 'latte', 'cappuccino'], [45, 1.5, 7, 1.2, 0], { cup: 150 }, 'cup', true),
  f('cola', 'Cola / soft drink', ['coke', 'pepsi', 'soda', 'soft drink'], [42, 0, 10.6, 0, 0], {}, 'can', true),
  f('orange_juice', 'Orange juice', ['juice', 'fruit juice'], [45, 0.7, 10.4, 0.2, 0.2], {}, 'glass', true),
  f('coconut_water', 'Coconut water', ['nariyal pani', 'tender coconut'], [19, 0.7, 3.7, 0.2, 1.1], {}, 'glass', true),
  f('beer', 'Beer', [], [43, 0.5, 3.6, 0, 0], { pint: 473 }, 'can', true),
  f('wine', 'Wine', ['red wine', 'white wine'], [83, 0.1, 2.6, 0, 0], { glass: 150 }, 'glass', true),

  // Snacks & fast food
  f('protein_bar', 'Protein bar', ['protein bar'], [350, 30, 35, 10, 5], { piece: 60 }, 'piece'),
  f('dark_chocolate', 'Dark chocolate (70–85%)', ['dark chocolate'], [598, 7.8, 45.9, 42.6, 10.9], { piece: 10 }, 'piece'),
  f('milk_chocolate', 'Milk chocolate', ['chocolate', 'dairy milk'], [535, 7.7, 59.4, 29.7, 3.4], { piece: 10, bar: 50 }, 'piece'),
  f('biscuits', 'Biscuits', ['biscuit', 'cookies', 'digestive', 'marie'], [473, 7, 64, 21, 2], { piece: 15 }, 'piece'),
  f('samosa', 'Samosa', ['samosas'], [310, 5, 32, 18, 2.5], { piece: 85 }, 'piece'),
  f('pakora', 'Pakora', ['pakoda', 'bhajji', 'bhaji'], [302, 7, 28, 18, 3], { piece: 25 }, 'piece'),
  f('momos_veg', 'Momos (veg, steamed)', ['momos', 'veg momos', 'dumplings'], [170, 5, 25, 5.5, 2], { piece: 30 }, 'piece'),
  f('momos_chicken', 'Momos (chicken, steamed)', ['chicken momos'], [190, 9, 20, 8, 1], { piece: 30 }, 'piece'),
  f('pizza', 'Pizza (cheese)', ['pizza', 'margherita'], [266, 11.4, 33, 9.8, 2.3], { slice: 107, piece: 107 }, 'slice'),
  f('burger_chicken', 'Chicken burger', ['burger'], [250, 13, 25, 11, 1.5], { piece: 200 }, 'piece'),
  f('fries', 'French fries', ['fries', 'chips fries', 'french fries'], [312, 3.4, 41, 15, 3.8], { serving: 117 }, 'serving'),
  f('shawarma', 'Chicken shawarma roll', ['shawarma', 'kathi roll', 'chicken roll', 'wrap'], [220, 12, 22, 9.5, 2], { piece: 250 }, 'piece'),
  f('sandwich_veg', 'Veg sandwich', ['sandwich'], [220, 7, 30, 8, 3], { piece: 150 }, 'piece'),
  f('potato_chips', 'Potato chips', ['chips', 'lays', 'crisps'], [536, 6.6, 53, 34.6, 4.4], { pack: 50 }, 'pack'),
  f('popcorn', 'Popcorn', [], [387, 13, 78, 4.5, 15], { cup: 8 }, 'cup'),
  f('gulab_jamun', 'Gulab jamun', [], [326, 5, 45, 14, 0.5], { piece: 40 }, 'piece'),
  f('ice_cream', 'Ice cream (vanilla)', ['ice cream', 'icecream'], [207, 3.5, 23.6, 11, 0.7], { scoop: 65, cup: 130 }, 'scoop'),
  f('coconut_chutney', 'Coconut chutney', ['chutney'], [206, 3, 8, 18, 4], { tbsp: 20 }, 'tbsp'),
];

export function macrosFor(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: per100.kcal * k,
    protein: per100.protein * k,
    carbs: per100.carbs * k,
    fat: per100.fat * k,
    fiber: per100.fiber * k,
  };
}
