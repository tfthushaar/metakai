import {
  acceptPoint,
  bestEffort,
  decodePolyline,
  distanceM,
  durationLabel,
  encodePolyline,
  paceLabel,
  routePath,
  simplify,
  splits,
  trackStats,
  type GeoPoint,
} from '../geo';

/** A straight run north at a steady speed, one fix every `every` seconds. */
function straight(meters: number, secPerKm: number, every = 5, startLat = 12.97, lon = 77.59): GeoPoint[] {
  const mPerDegLat = 111195;
  const speed = 1000 / secPerKm;
  const pts: GeoPoint[] = [];
  for (let s = 0; s * speed <= meters + 1e-6; s += every) {
    pts.push({ lat: startLat + (s * speed) / mPerDegLat, lon, t: s * 1000, alt: 900, acc: 5 });
  }
  return pts;
}

describe('distance', () => {
  it('matches known distances', () => {
    // 1 degree of latitude ≈ 111.2 km
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1);
    expect(distanceM({ lat: 12.97, lon: 77.59 }, { lat: 12.97, lon: 77.59 })).toBe(0);
  });
});

describe('filtering', () => {
  const a: GeoPoint = { lat: 12.97, lon: 77.59, t: 0, acc: 5 };
  it('drops inaccurate fixes, jitter and teleports', () => {
    expect(acceptPoint(null, { ...a, acc: 40 }, 'run')).toBe(false);
    expect(acceptPoint(null, a, 'run')).toBe(true);
    expect(acceptPoint(a, { ...a, lat: a.lat + 1 / 111195, t: 1000 }, 'run')).toBe(false); // 1 m jitter
    expect(acceptPoint(a, { ...a, lat: a.lat + 15 / 111195, t: 5000 }, 'run')).toBe(true); // 3 m/s
    expect(acceptPoint(a, { ...a, lat: a.lat + 200 / 111195, t: 5000 }, 'run')).toBe(false); // 40 m/s
    expect(acceptPoint(a, { ...a, lat: a.lat + 100 / 111195, t: 5000 }, 'cycle')).toBe(true); // 20 m/s on a bike
  });
});

describe('stats and splits', () => {
  it('measures a steady 5 km at 5:00/km', () => {
    const run = straight(5000, 300);
    const s = trackStats([run], 'run');
    expect(s.distanceM).toBeGreaterThan(4990);
    expect(s.distanceM).toBeLessThan(5010);
    expect(s.movingSec).toBeCloseTo(1500, -1);
    expect(paceLabel(s.movingSec, s.distanceM)).toBe('5:00');

    const sp = splits([run], 'run');
    expect(sp).toHaveLength(5);
    sp.forEach((x) => expect(x.movingSec).toBeCloseTo(300, 0));
  });

  it('excludes stops from moving time and gaps between segments from distance', () => {
    const first = straight(1000, 300);
    const last = first[first.length - 1];
    const stopped: GeoPoint = { ...last, t: last.t + 120_000 }; // two minutes standing still
    const second = straight(1000, 300, 5, last.lat + 0.01).map((p) => ({ ...p, t: p.t + stopped.t + 1000 }));
    const s = trackStats([[...first, stopped], second], 'run');
    expect(s.distanceM).toBeCloseTo(2000, -1);
    expect(s.movingSec).toBeCloseTo(600, -1);
  });

  it('counts real climbs, not altitude noise', () => {
    const pts = straight(1000, 300).map((p, i) => ({ ...p, alt: 900 + (i % 2) * 2 + i * 0.5 }));
    const s = trackStats([pts], 'run');
    // 61 fixes climbing 0.5 m each ≈ 30 m; the ±2 m wobble adds nothing
    expect(s.elevationGainM).toBeGreaterThanOrEqual(26);
    expect(s.elevationGainM).toBeLessThanOrEqual(30);
  });

  it('finds the fastest 1 km inside a longer run', () => {
    const slow = straight(2000, 360);
    const end = slow[slow.length - 1];
    const fast = straight(1000, 240, 5, end.lat).map((p) => ({ ...p, t: p.t + end.t + 5000 }));
    const effort = bestEffort([[...slow, ...fast.slice(1)]], 'run', 1000)!;
    expect(effort).toBeGreaterThan(235);
    expect(effort).toBeLessThan(250);
    expect(bestEffort([slow], 'run', 5000)).toBeNull();
  });
});

describe('storage and drawing', () => {
  it('round-trips encoded polylines', () => {
    const pts: [number, number][] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts);
  });

  it('simplifies straight lines to their ends', () => {
    const run = straight(1000, 300);
    const simple = simplify(run, 2);
    expect(simple).toHaveLength(2);
    const zigzag = run.map((p, i) => ({ ...p, lon: p.lon + (i % 2 ? 20 / 108000 : 0) }));
    expect(simplify(zigzag, 2).length).toBeGreaterThan(20);
  });

  it('fits a route into a box', () => {
    const d = routePath(
      [
        [0, 0],
        [0.001, 0.001],
      ],
      100,
      100,
      10,
    );
    expect(d.startsWith('M10.0,90.0')).toBe(true);
    expect(d.endsWith('L90.0,10.0')).toBe(true);
  });

  it('formats time', () => {
    expect(durationLabel(65)).toBe('1:05');
    expect(durationLabel(3735)).toBe('1:02:15');
  });
});
