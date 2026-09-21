import { clampOffset, glide, indexAtOffset, indexForKey, indexOfValue, maxOffset, releaseVelocity, RULER_TICK, tickCount, valueOfIndex } from '../ruler';

const kg = { min: 30, max: 250, step: 0.1 };
const age = { min: 13, max: 90, step: 1 };

describe('ruler scale', () => {
  it('has a tick for each step, ends included', () => {
    expect(tickCount(age)).toBe(78);
    expect(tickCount(kg)).toBe(2201);
  });

  it('maps values to ticks and back without floating-point dust', () => {
    expect(indexOfValue(kg, 81.1)).toBe(511);
    expect(valueOfIndex(kg, 511)).toBe(81.1);
    for (const i of [0, 1, 3, 7, 999, 2200]) expect(indexOfValue(kg, valueOfIndex(kg, i))).toBe(i);
  });

  it('keeps out-of-range values on the ruler', () => {
    expect(indexOfValue(age, 5)).toBe(0);
    expect(indexOfValue(age, 200)).toBe(77);
  });

  it('turns an offset into the tick under the indicator', () => {
    expect(indexAtOffset(age, 0)).toBe(0);
    expect(indexAtOffset(age, 4 * RULER_TICK + 4)).toBe(4);
    expect(indexAtOffset(age, 4 * RULER_TICK + 6)).toBe(5);
    expect(indexAtOffset(age, -50)).toBe(0);
    expect(indexAtOffset(age, 99999)).toBe(77);
  });

  it('cannot slide past either end', () => {
    expect(clampOffset(age, -20)).toBe(0);
    expect(clampOffset(age, 1e6)).toBe(maxOffset(age));
    expect(maxOffset(age)).toBe(770);
  });
});

describe('momentum', () => {
  it('coasts a distance in proportion to the release speed', () => {
    let state = { offset: 0, velocity: 1 };
    for (let t = 0; t < 4000; t += 16) state = glide(state.offset, state.velocity, 16);
    expect(state.offset).toBeGreaterThan(150);
    expect(state.offset).toBeLessThan(165);
    expect(Math.abs(state.velocity)).toBeLessThan(0.001);
  });

  it('goes the same distance however the frames are cut', () => {
    const run = (dt: number) => {
      let s = { offset: 0, velocity: 0.8 };
      for (let t = 0; t < 2000; t += dt) s = glide(s.offset, s.velocity, dt);
      return s.offset;
    };
    expect(Math.abs(run(8) - run(33))).toBeLessThan(1);
  });

  it('runs backwards for a negative velocity and stays put at zero', () => {
    expect(glide(100, -1, 16).offset).toBeLessThan(100);
    expect(glide(100, 0, 16)).toEqual({ offset: 100, velocity: 0 });
  });
});

describe('releaseVelocity', () => {
  it('measures the recent movement', () => {
    const samples = [
      { t: 900, x: 100 },
      { t: 950, x: 130 },
      { t: 1000, x: 160 },
    ];
    expect(releaseVelocity(samples, 1010)).toBeCloseTo(0.6, 5);
  });

  it('is zero when the pointer had stopped before letting go', () => {
    expect(releaseVelocity([{ t: 100, x: 0 }, { t: 160, x: 90 }], 800)).toBe(0);
  });

  it('is zero with too little to go on', () => {
    expect(releaseVelocity([], 10)).toBe(0);
    expect(releaseVelocity([{ t: 5, x: 3 }], 10)).toBe(0);
  });

  it('is negative when moving left', () => {
    expect(releaseVelocity([{ t: 0, x: 200 }, { t: 50, x: 150 }], 60)).toBeLessThan(0);
  });
});

describe('indexForKey', () => {
  it('steps by one with the arrows and by a major tick with the page keys', () => {
    expect(indexForKey('ArrowRight', 10, 78, 5)).toBe(11);
    expect(indexForKey('ArrowLeft', 10, 78, 5)).toBe(9);
    expect(indexForKey('ArrowUp', 10, 78, 5)).toBe(11);
    expect(indexForKey('ArrowDown', 10, 78, 5)).toBe(9);
    expect(indexForKey('PageUp', 10, 78, 5)).toBe(15);
    expect(indexForKey('PageDown', 10, 78, 5)).toBe(5);
  });

  it('jumps to the ends and stops at them', () => {
    expect(indexForKey('Home', 10, 78, 5)).toBe(0);
    expect(indexForKey('End', 10, 78, 5)).toBe(77);
    expect(indexForKey('ArrowLeft', 0, 78, 5)).toBe(0);
    expect(indexForKey('PageUp', 75, 78, 5)).toBe(77);
  });

  it('ignores other keys', () => {
    expect(indexForKey('a', 10, 78, 5)).toBeNull();
    expect(indexForKey('Tab', 10, 78, 5)).toBeNull();
  });
});
