import { Easing, FadeOut, LinearTransition, withDelay, withSpring, withTiming, type EntryAnimationsValues, type LayoutAnimation } from 'react-native-reanimated';

/**
 * Shared motion language: soft springs that settle quickly with a hint of follow-through.
 * Everything respects Reduce motion through Reanimated's global setting.
 */
export const SPRING = { damping: 22, stiffness: 260, mass: 0.9 } as const;
/** Softer spring for things that travel, like cards sliding in. */
export const SOFT_SPRING = { damping: 20, stiffness: 170, mass: 0.9 } as const;
/** Quick, slightly lively spring for taps. */
export const TAP_SPRING = { damping: 15, stiffness: 320, mass: 0.7 } as const;
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

const STAGGER_MS = 50;
const MAX_STAGGER = 8;

/** Cards slide up into place, one after another. */
export const enterUp =
  (index = 0) =>
  (_values: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    const delay = 30 + Math.min(index, MAX_STAGGER) * STAGGER_MS;
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 22 }, { scale: 0.98 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 260, easing: EASE_OUT })),
        transform: [{ translateY: withDelay(delay, withSpring(0, SOFT_SPRING)) }, { scale: withDelay(delay, withSpring(1, SOFT_SPRING)) }],
      },
    };
  };

/** A newly logged row drops in gently. */
export const rowEnter = (_values: EntryAnimationsValues): LayoutAnimation => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -8 }, { scale: 0.97 }] },
    animations: {
      opacity: withTiming(1, { duration: 220, easing: EASE_OUT }),
      transform: [{ translateY: withSpring(0, SPRING) }, { scale: withSpring(1, SPRING) }],
    },
  };
};

export const rowExit = FadeOut.duration(160);

/** Neighbours glide into their new place when a row is added or removed. */
export const layout = LinearTransition.springify().damping(22).stiffness(220).mass(0.9);
