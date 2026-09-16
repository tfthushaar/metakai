// Parses a plain-language meal description into structured food items.
// Gemini (free tier) first, Groq as fallback. Requires a signed-in user.
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Item {
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

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '60');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

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

const SCHEMA = {
  type: 'object',
  properties: {
    meal: { type: 'string', nullable: true, enum: ['breakfast', 'lunch', 'dinner', 'snacks'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          fiber: { type: 'number' },
        },
        required: ['name', 'quantity', 'unit', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
      },
    },
  },
  required: ['items'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function gemini(text: string) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
}

async function groq(text: string) {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY not set');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${SYSTEM}\nRespond with JSON: {"meal": string|null, "items": [{"name","quantity","unit","grams","kcal","protein","carbs","fat","fiber"}]}`,
        },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}

function sanitize(raw: { meal?: string | null; items?: Partial<Item>[] }) {
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
  const meal = ['breakfast', 'lunch', 'dinner', 'snacks'].includes(raw.meal ?? '') ? raw.meal : null;
  return { meal, items };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

  let text = '';
  try {
    const body = await req.json();
    text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!text) return json({ error: 'Missing text' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: calls, error: usageError } = await admin.rpc('increment_ai_usage', { p_user: userData.user.id });
  if (usageError) return json({ error: 'Usage tracking failed' }, 500);
  if ((calls as number) > DAILY_LIMIT) return json({ error: 'Daily AI limit reached. Offline matching still works.' }, 429);

  const errors: string[] = [];
  for (const [provider, fn] of [
    ['gemini', gemini],
    ['groq', groq],
  ] as const) {
    try {
      const result = sanitize(await fn(text));
      return json({ ...result, provider });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  console.error('parse-food failed', errors);
  return json({ error: 'AI is unavailable right now. Try again shortly.' }, 503);
});
