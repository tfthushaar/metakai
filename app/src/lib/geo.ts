/** GPS track maths: distance, noise filtering, moving time, splits, best efforts and route drawing. */

export interface GeoPoint {
  lat: number;
  lon: number;
  /** Timestamp, ms. */
  t: number;
  alt?: number | null;
  /** Horizontal accuracy, metres. */
  acc?: number | null;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: Pick<GeoPoint, 'lat' | 'lon'>, b: Pick<GeoPoint, 'lat' | 'lon'>): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ---------------- filtering ---------------- */

export type TrackKind = 'run' | 'walk' | 'hike' | 'cycle';

/** Fastest plausible speed per activity, m/s. Faster jumps are GPS glitches. */
const MAX_SPEED: Record<TrackKind, number> = { walk: 4, hike: 4, run: 11, cycle: 25 };
/** Below this speed you count as stopped, m/s. */
export const MOVING_SPEED: Record<TrackKind, number> = { walk: 0.4, hike: 0.3, run: 0.8, cycle: 1.2 };

export const MAX_ACCURACY_M = 25;

/** Whether a new fix should extend the track. */
export function acceptPoint(prev: GeoPoint | null, next: GeoPoint, kind: TrackKind): boolean {
  if (next.acc != null && next.acc > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  const d = distanceM(prev, next);
  // Ignore jitter smaller than the fix's own uncertainty.
  if (d < Math.max(3, (next.acc ?? 0) * 0.5)) return false;
  return d / dt <= MAX_SPEED[kind];
}

/* ---------------- stats ---------------- */

export interface TrackStats {
  distanceM: number;
  movingSec: number;
  elevationGainM: number;
}

/** Counts climbs only once they exceed this, to ignore altitude noise. */
const CLIMB_THRESHOLD_M = 4;

/** Stats over segments (a pause starts a new segment; distance between segments is not counted). */
export function trackStats(segments: GeoPoint[][], kind: TrackKind): TrackStats {
  let distance = 0;
  let moving = 0;
  let gain = 0;
  for (const seg of segments) {
    let ref: number | null = null;
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      if (i > 0) {
        const prev = seg[i - 1];
        const d = distanceM(prev, p);
        const dt = (p.t - prev.t) / 1000;
        distance += d;
        if (dt > 0 && d / dt >= MOVING_SPEED[kind]) moving += dt;
      }
      if (p.alt != null) {
        if (ref == null) ref = p.alt;
        else if (p.alt - ref >= CLIMB_THRESHOLD_M) {
          gain += p.alt - ref;
          ref = p.alt;
        } else if (ref - p.alt >= CLIMB_THRESHOLD_M) ref = p.alt;
      }
    }
  }
  return { distanceM: distance, movingSec: moving, elevationGainM: Math.round(gain) };
}

/** Cumulative distance and moving time at each point, flattened across segments. */
function cumulative(segments: GeoPoint[][], kind: TrackKind): { d: number[]; t: number[]; alt: (number | null)[] } {
  const d: number[] = [];
  const t: number[] = [];
  const alt: (number | null)[] = [];
  let dist = 0;
  let time = 0;
  for (const seg of segments) {
    seg.forEach((p, i) => {
      if (i > 0) {
        const step = distanceM(seg[i - 1], p);
        const dt = (p.t - seg[i - 1].t) / 1000;
        dist += step;
        if (dt > 0 && step / dt >= MOVING_SPEED[kind]) time += dt;
      }
      d.push(dist);
      t.push(time);
      alt.push(p.alt ?? null);
    });
  }
  return { d, t, alt };
}

export interface Split {
  /** 1-based. */
  index: number;
  distanceM: number;
  movingSec: number;
  elevationDeltaM: number | null;
}

/** Splits every `splitM` metres (1000 for km, 1609.344 for miles), with a final partial split. */
export function splits(segments: GeoPoint[][], kind: TrackKind, splitM = 1000): Split[] {
  const { d, t, alt } = cumulative(segments, kind);
  if (d.length < 2) return [];
  const total = d[d.length - 1];
  const out: Split[] = [];
  const timeAt = (target: number) => {
    let i = d.findIndex((x) => x >= target);
    if (i <= 0) return i === 0 ? t[0] : t[t.length - 1];
    const f = (target - d[i - 1]) / (d[i] - d[i - 1] || 1);
    return t[i - 1] + f * (t[i] - t[i - 1]);
  };
  const altAt = (target: number) => {
    const i = d.findIndex((x) => x >= target);
    const idx = i < 0 ? d.length - 1 : i;
    return alt[idx];
  };
  let start = 0;
  let index = 1;
  while (start < total - 1) {
    const end = Math.min(start + splitM, total);
    if (end - start < splitM * 0.1 && out.length) break;
    const a0 = altAt(start);
    const a1 = altAt(end);
    out.push({ index, distanceM: end - start, movingSec: timeAt(end) - timeAt(start), elevationDeltaM: a0 != null && a1 != null ? Math.round(a1 - a0) : null });
    start = end;
    index++;
  }
  return out;
}

/** Fastest moving time to cover `targetM`, or null when the track is shorter. */
export function bestEffort(segments: GeoPoint[][], kind: TrackKind, targetM: number): number | null {
  const { d, t } = cumulative(segments, kind);
  if (!d.length || d[d.length - 1] < targetM) return null;
  let best = Infinity;
  let j = 0;
  for (let i = 0; i < d.length; i++) {
    while (j < d.length && d[j] - d[i] < targetM) j++;
    if (j >= d.length) break;
    const span = d[j] - d[i];
    const time = (t[j] - t[i]) * (targetM / span);
    if (time > 0 && time < best) best = time;
  }
  return Number.isFinite(best) ? best : null;
}

export const BEST_EFFORTS: { id: string; label: string; meters: number }[] = [
  { id: '1k', label: '1 km', meters: 1000 },
  { id: '1mi', label: '1 mile', meters: 1609.344 },
  { id: '5k', label: '5 km', meters: 5000 },
  { id: '10k', label: '10 km', meters: 10000 },
  { id: 'half', label: 'Half marathon', meters: 21097.5 },
  { id: 'marathon', label: 'Marathon', meters: 42195 },
];

/* ---------------- storage ---------------- */

/** Douglas–Peucker simplification in metres, keeping the route shape with far fewer points. */
export function simplify<T extends Pick<GeoPoint, 'lat' | 'lon'>>(points: T[], toleranceM: number): T[] {
  if (points.length <= 2) return points;
  const lat0 = rad(points[0].lat);
  const xy = points.map((p) => [rad(p.lon) * Math.cos(lat0) * R, rad(p.lat) * R]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay);
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (dist > maxD) {
        maxD = dist;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Google encoded polyline (precision 5). */
export function encodePolyline(points: [number, number][]): string {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLon = Math.round(lon * 1e5);
    out += enc(iLat - pLat) + enc(iLon - pLon);
    pLat = iLat;
    pLon = iLon;
  }
  return out;
}

export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lon += next();
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

/* ---------------- drawing ---------------- */

/** SVG path for a route fitted into a box, north up, keeping its true proportions. */
export function routePath(points: [number, number][], width: number, height: number, padding = 12): string {
  if (points.length < 2) return '';
  const meanLat = rad(points.reduce((s, p) => s + p[0], 0) / points.length);
  const xs = points.map((p) => p[1] * Math.cos(meanLat));
  const ys = points.map((p) => p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return points
    .map((_, i) => `${i ? 'L' : 'M'}${(offX + (xs[i] - minX) * scale).toFixed(1)},${(offY + (maxY - ys[i]) * scale).toFixed(1)}`)
    .join(' ');
}

/** "5:32" per km (or per mile when `perM` is 1609.344). */
export function paceLabel(movingSec: number, distanceM: number, perM = 1000): string {
  if (distanceM < 10 || movingSec <= 0) return '—';
  const secPer = (movingSec / distanceM) * perM;
  if (secPer >= 60 * 60) return '—';
  const s = Math.round(secPer);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:02:15" or "32:05". */
export function durationLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
