import type { TextStyle } from 'react-native';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TypeVariant =
  | 'display'
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption';

export const TYPE: Record<TypeVariant, TextStyle> = {
  display: { fontFamily: FONT.bold, fontSize: 48, lineHeight: 54, letterSpacing: -1.6 },
  largeTitle: { fontFamily: FONT.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.9 },
  title1: { fontFamily: FONT.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title2: { fontFamily: FONT.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  title3: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  headline: { fontFamily: FONT.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.25 },
  body: { fontFamily: FONT.regular, fontSize: 17, lineHeight: 22, letterSpacing: -0.25 },
  callout: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  subhead: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  footnote: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  caption: { fontFamily: FONT.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
