/** Colour helpers for the custom theme picker. Hue 0–360, saturation and value 0–1. */

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function isHex(value: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(value.trim());
}

/** "#aBc123" or "abc123" → "#ABC123". */
export function normalizeHex(value: string): string {
  const v = value.trim().replace('#', '').toUpperCase();
  return `#${v}`;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const c = clamp01(v) * clamp01(s);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = clamp01(v) - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): Hsv {
  const v = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/** Blends two colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = normalizeHex(a).slice(1);
  const pb = normalizeHex(b).slice(1);
  const out = [0, 2, 4].map((i) => {
    const x = parseInt(pa.slice(i, i + 2), 16);
    const y = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * clamp01(t))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${out.join('')}`.toUpperCase();
}

/** Relative luminance (WCAG), 0 for black and 1 for white. */
export function luminance(hex: string): number {
  const v = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever is easier to read on the colour. */
export function textOn(hex: string): '#000000' | '#FFFFFF' {
  return luminance(hex) > 0.4 ? '#000000' : '#FFFFFF';
}
