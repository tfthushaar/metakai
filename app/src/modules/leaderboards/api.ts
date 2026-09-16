import { googleTokens, signInWithGoogle } from '../../core/google';
import { DEFAULT_LEADERBOARD, useSettings } from '../../core/store/settings';
import type { Person, PhysiqueRank, RunRank } from '../../lib/ranks';

/**
 * Opt-in leaderboards on the Metakai Worker. Only derived values leave the phone: a chosen name,
 * optional country, sex, age group, weight class, height band and scores.
 */
const API = (process.env.EXPO_PUBLIC_RANKS_API ?? '').replace(/\/+$/, '');
/** Development builds can talk to a local server with a fake identity (set in .env.local). */
const DEV_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_RANKS_DEV_TOKEN : undefined;

export const leaderboardsAvailable = API.length > 0;

export type BoardId = string;
export type BoardFilter = 'all' | 'sex' | 'age' | 'weight' | 'height' | 'country' | 'friends';

export const FILTER_LABEL: Record<BoardFilter, string> = {
  all: 'Everyone',
  sex: 'My sex',
  age: 'My age',
  weight: 'My weight class',
  height: 'My height',
  country: 'My country',
  friends: 'Friends',
};

export interface BoardEntry {
  rank: number;
  name: string;
  country: string | null;
  score: number;
  value: number | null;
  me: boolean;
}

export interface Board {
  board: BoardId;
  filter: BoardFilter;
  total: number;
  me: { rank: number | null; percentile: number; score: number; value: number | null; held: boolean } | null;
  top: BoardEntry[];
  histogram: number[];
}

export interface RemoteProfile {
  displayName: string;
  country: string | null;
  friendCode: string;
  sex: string;
  ageGroup: string;
  weightClass: string;
  heightBand: string;
}

async function call<T>(path: string, init: RequestInit = {}, interactive = false): Promise<T> {
  if (!API) throw new Error('Leaderboards are not available in this build.');
  if (DEV_TOKEN) return request<T>(path, init, DEV_TOKEN);
  let tokens;
  try {
    tokens = await googleTokens();
  } catch {
    if (!interactive) throw new Error('Sign in with Google to see leaderboards.');
    if (!(await signInWithGoogle('Leaderboards'))) throw new Error('Sign-in cancelled.');
    tokens = await googleTokens();
  }
  if (!tokens.idToken) throw new Error('Leaderboards are not set up in this build yet.');
  return request<T>(path, init, tokens.idToken);
}

async function request<T>(path: string, init: RequestInit, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
    });
  } catch {
    throw new Error('No connection. Try again when you’re online.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server error ${res.status}.`);
  return data as T;
}

export const getMe = () => call<{ profile: RemoteProfile | null }>('/v1/me');

const profileKey = (p: Person) => `${p.sex}|${p.age}|${Math.round(p.weightKg)}|${Math.round(p.heightCm)}`;

export async function joinLeaderboards(p: { displayName: string; country: string | null }, person: Person) {
  const res = await call<{ profile: RemoteProfile }>(
    '/v1/me',
    { method: 'PUT', body: JSON.stringify({ ...p, sex: person.sex, age: person.age, weightKg: person.weightKg, heightCm: person.heightCm }) },
    true,
  );
  const lb = useSettings.getState().leaderboard;
  useSettings.getState().set({
    leaderboard: { ...lb, joined: true, displayName: res.profile.displayName, country: res.profile.country, lastUploadKey: null, lastProfileKey: profileKey(person) },
  });
  return res.profile;
}

export async function leaveLeaderboards() {
  await call('/v1/me', { method: 'DELETE' });
  useSettings.getState().set({ leaderboard: DEFAULT_LEADERBOARD });
}

export const getBoard = (board: BoardId, filter: BoardFilter) => call<Board>(`/v1/boards/${encodeURIComponent(board)}?filter=${filter}`);
export const listFriends = () => call<{ friends: { name: string; country: string | null }[] }>('/v1/friends');
export const addFriend = (code: string) => call<{ name: string }>('/v1/friends', { method: 'POST', body: JSON.stringify({ code }) });
export const removeFriend = (name: string) => call('/v1/friends?name=' + encodeURIComponent(name), { method: 'DELETE' });

/** Scores in the shape the server expects. Only lifts with enough sessions and GPS runs are sent. */
export function buildUpload(physique: PhysiqueRank | null, run: RunRank | null) {
  const out: Record<string, unknown> = {};
  if (physique && physique.rankedCount > 0) {
    const groups: Record<string, { score: number; multiple: number; sessions: number }> = {};
    for (const g of physique.groups) {
      if (!g.best) continue;
      groups[g.group] = {
        score: Math.round(g.score * 10) / 10,
        multiple: Math.round(g.best.comparison.multiple * 100) / 100,
        sessions: g.best.sessions ?? 0,
      };
    }
    out.physique = { overall: Math.round(physique.overall * 10) / 10, groups };
  }
  if (run && run.best) {
    const efforts: Record<string, { timeSec: number; ageGrade: number; verified: boolean }> = {};
    for (const d of run.distances) {
      efforts[d.distance.id] = { timeSec: Math.round(d.effort.timeSec), ageGrade: Math.round(d.ageGrade * 10) / 10, verified: d.effort.verified };
    }
    out.run = { overall: Math.round(run.overall * 10) / 10, efforts };
  }
  return out;
}

const SIX_HOURS = 6 * 3600_000;

/** Uploads current scores if they changed and enough time has passed. Returns true when sent. */
export async function syncScores(person: Person, physique: PhysiqueRank | null, run: RunRank | null, force = false): Promise<boolean> {
  const lb = useSettings.getState().leaderboard;
  if (!API || !lb.joined) return false;
  if (lb.displayName && profileKey(person) !== lb.lastProfileKey) {
    await joinLeaderboards({ displayName: lb.displayName, country: lb.country }, person);
  }
  const upload = buildUpload(physique, run);
  const key = JSON.stringify(upload);
  const recent = lb.lastUploadAt && Date.now() - Date.parse(lb.lastUploadAt) < SIX_HOURS;
  if (!force && (key === lb.lastUploadKey || recent)) return false;
  const res = await call<{ accepted: number; throttled: boolean }>('/v1/scores', { method: 'PUT', body: key });
  if (res.throttled) return false;
  useSettings.getState().set({ leaderboard: { ...useSettings.getState().leaderboard, lastUploadAt: new Date().toISOString(), lastUploadKey: key } });
  return true;
}
