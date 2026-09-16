import Storage from 'expo-sqlite/kv-store';

import { useAiKeys, type AiProvider } from '../../core/aiKey';
import { block, emptyUsage, estimateTokens, nextPacificMidnight, pacificDay, parseDelay, recordUse, waitMs, type ModelLimits, type ModelUsage } from '../../lib/rateBudget';

/**
 * Routes AI requests across the user's own free-tier models. Each model has its own quota, so when
 * one is out of room the next one is used straight away, and the user rarely sees a limit.
 *
 * Free limits (September 2026). Google shows exact numbers per project in AI Studio, so these are
 * conservative defaults; 429 responses and Groq's rate-limit headers correct them at runtime.
 * - Gemini Flash-Lite: ~15 RPM, ~1,000 RPD, 250K TPM. Resets at midnight Pacific.
 * - Gemini Flash: ~10 RPM, ~250 RPD, 250K TPM.
 * - Groq gpt-oss-20b / gpt-oss-120b: 30 RPM, 1,000 RPD, 8K TPM, 200K TPD each.
 */
export interface Route {
  id: string;
  provider: AiProvider;
  model: string;
  limits: ModelLimits;
}

export const ROUTES: Route[] = [
  { id: 'gemini-lite', provider: 'gemini', model: 'gemini-flash-lite-latest', limits: { rpm: 12, rpd: 900 } },
  { id: 'groq-20b', provider: 'groq', model: 'openai/gpt-oss-20b', limits: { rpm: 25, rpd: 950, tpm: 7000 } },
  { id: 'gemini-flash', provider: 'gemini', model: 'gemini-flash-latest', limits: { rpm: 8, rpd: 230 } },
  { id: 'groq-120b', provider: 'groq', model: 'openai/gpt-oss-120b', limits: { rpm: 25, rpd: 950, tpm: 7000 } },
];

/** Output budget: a long meal is ~30 items of ~40 tokens, plus reasoning for gpt-oss. */
const OUTPUT_TOKENS = 1500;
const TIMEOUT_MS = 15_000;
/** Wait this long for a model to free up rather than failing. */
const MAX_WAIT_MS = 8_000;

const USAGE_KEY = 'metakai.aiUsage';

function loadUsage(): Record<string, ModelUsage> {
  try {
    return JSON.parse(Storage.getItemSync(USAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
const usage = loadUsage();
const usageOf = (id: string) => usage[id] ?? emptyUsage();
function saveUsage(id: string, u: ModelUsage) {
  usage[id] = u;
  try {
    Storage.setItemSync(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Budget tracking is best-effort.
  }
}

/** A failure that should move on to the next model. */
class Skip extends Error {
  constructor(
    message: string,
    readonly badKey = false,
  ) {
    super(message);
  }
}

export interface ChatRequest {
  system: string;
  user: string;
  /** JSON schema for Gemini's structured output; Groq gets the shape in the system prompt. */
  schema: object;
  shapeHint: string;
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    throw new Skip('The request timed out.');
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(route: Route, key: string, req: ChatRequest): Promise<string> {
  const res = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: OUTPUT_TOKENS * 2, responseMimeType: 'application/json', responseSchema: req.schema },
    }),
  });
  if (res.ok) {
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.find((p: { text?: string; thought?: boolean }) => p.text && !p.thought)?.text;
    if (!text) throw new Skip('Empty answer.');
    return text;
  }
  const body = await res.json().catch(() => null);
  const now = Date.now();
  if (res.status === 429) {
    const details: { '@type'?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] = body?.error?.details ?? [];
    const perDay = details.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? '')));
    const retry = parseDelay(details.find((d) => d.retryDelay)?.retryDelay) ?? 60_000;
    saveUsage(route.id, block(usageOf(route.id), perDay ? nextPacificMidnight(now) : now + retry));
    throw new Skip('Rate limited.');
  }
  if (res.status === 400 && /API key/i.test(body?.error?.message ?? '')) throw new Skip('Gemini key rejected.', true);
  if (res.status === 401 || res.status === 403) throw new Skip('Gemini key rejected.', true);
  if (res.status === 404) {
    // Model retired: park it for a day; the other routes carry on.
    saveUsage(route.id, block(usageOf(route.id), now + 86400_000));
    throw new Skip('Model unavailable.');
  }
  saveUsage(route.id, block(usageOf(route.id), now + 30_000));
  throw new Skip(`Gemini ${res.status}`);
}

async function callGroq(route: Route, key: string, req: ChatRequest): Promise<string> {
  const res = await withTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: route.model,
      temperature: 0.1,
      reasoning_effort: 'low',
      max_completion_tokens: OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${req.system}\nRespond with JSON only: ${req.shapeHint}` },
        { role: 'user', content: req.user },
      ],
    }),
  });
  const now = Date.now();
  // Learn the real daily allowance from the headers.
  const remaining = res.headers.get('x-ratelimit-remaining-requests');
  if (remaining != null && Number.isFinite(Number(remaining))) {
    let u: ModelUsage = { ...usageOf(route.id), remainingToday: Number(remaining), day: pacificDay(now) };
    if (Number(remaining) === 0) u = block(u, now + (parseDelay(res.headers.get('x-ratelimit-reset-requests')) ?? 3600_000));
    saveUsage(route.id, u);
  }
  if (res.ok) {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Skip('Empty answer.');
    return text;
  }
  if (res.status === 429) {
    saveUsage(route.id, block(usageOf(route.id), now + (parseDelay(res.headers.get('retry-after')) ?? 60_000)));
    throw new Skip('Rate limited.');
  }
  if (res.status === 401 || res.status === 403) throw new Skip('Groq key rejected.', true);
  const message: string = (await res.json().catch(() => null))?.error?.message ?? '';
  if (res.status === 404 || /decommissioned|does not exist|not found/i.test(message)) {
    saveUsage(route.id, block(usageOf(route.id), now + 86400_000));
    throw new Skip('Model unavailable.');
  }
  if (res.status === 400) throw new Skip('Bad answer.');
  saveUsage(route.id, block(usageOf(route.id), now + 30_000));
  throw new Skip(`Groq ${res.status}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AiUnavailable extends Error {}

/** Sends the request to the first model with room, falling through on limits and errors. */
export async function routeChat(req: ChatRequest): Promise<string> {
  const keys = useAiKeys.getState();
  const routes = ROUTES.filter((r) => keys[r.provider]);
  if (routes.length === 0) throw new AiUnavailable('Add a free Gemini or Groq key in Settings → AI.');
  const tokens = estimateTokens(req.system + req.user + req.shapeHint) + OUTPUT_TOKENS;
  const badKeys = new Set<AiProvider>();

  for (let attempt = 0; attempt < 2; attempt++) {
    let soonest = Infinity;
    for (const route of routes) {
      if (badKeys.has(route.provider)) continue;
      const now = Date.now();
      const day = pacificDay(now);
      const wait = waitMs(usageOf(route.id), route.limits, now, day, tokens);
      if (wait > 0) {
        soonest = Math.min(soonest, wait);
        continue;
      }
      saveUsage(route.id, recordUse(usageOf(route.id), now, day, tokens));
      try {
        return route.provider === 'gemini' ? await callGemini(route, keys.gemini!, req) : await callGroq(route, keys.groq!, req);
      } catch (e) {
        if (e instanceof Skip && e.badKey) badKeys.add(route.provider);
        else if (!(e instanceof Skip)) throw e;
      }
    }
    if (badKeys.size > 0 && routes.every((r) => badKeys.has(r.provider))) {
      throw new AiUnavailable('Your AI key was rejected. Check it in Settings → AI.');
    }
    if (soonest > MAX_WAIT_MS) break;
    await sleep(soonest + 250);
  }

  const resume = Math.min(...routes.filter((r) => !badKeys.has(r.provider)).map((r) => Date.now() + waitMs(usageOf(r.id), r.limits, Date.now(), pacificDay(Date.now()), tokens)));
  const when = Number.isFinite(resume)
    ? new Date(resume).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : new Date(nextPacificMidnight(Date.now())).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  throw new AiUnavailable(`AI is busy right now. Try again after ${when}, or add ${keys.groq ? 'a Gemini' : 'a Groq'} key for more room. Offline matching still works.`);
}

/** Requests left today across all configured models, for the settings screen. */
export function aiAllowanceToday(): { provider: AiProvider; model: string; used: number; limit: number }[] {
  const keys = useAiKeys.getState();
  const day = pacificDay(Date.now());
  return ROUTES.filter((r) => keys[r.provider]).map((r) => {
    const u = usageOf(r.id);
    const used = u.day === day ? u.dayCount : 0;
    const limit = u.day === day && u.remainingToday != null ? used + u.remainingToday : r.limits.rpd;
    return { provider: r.provider, model: r.model, used, limit };
  });
}
