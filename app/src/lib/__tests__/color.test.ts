import { hexToHsv, hsvToHex, isHex, luminance, mixHex, normalizeHex, textOn } from '../color';

describe('color', () => {
  it('converts between hex and HSV', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00FF00');
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe('#000080');
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#FFFFFF');
    for (const hex of ['#E5262A', '#0A84FF', '#30D158', '#8E44C9', '#777777']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('validates and normalises hex input', () => {
    expect(isHex('#e5262a')).toBe(true);
    expect(isHex('e5262a')).toBe(true);
    expect(isHex('#e526')).toBe(false);
    expect(isHex('zzzzzz')).toBe(false);
    expect(normalizeHex(' e5262a ')).toBe('#E5262A');
  });

  it('mixes colours', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#FF0000', '#0000FF', 0)).toBe('#FF0000');
    expect(mixHex('#FF0000', '#0000FF', 1)).toBe('#0000FF');
  });

  it('picks readable text colours', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
    expect(textOn('#FFD60A')).toBe('#000000');
    expect(textOn('#E5262A')).toBe('#FFFFFF');
  });
});
