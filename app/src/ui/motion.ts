import { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

/** Shared motion language: short, soft, never bouncy. */
export const SPRING = { damping: 22, stiffness: 260, mass: 0.9 } as const;
export const SPRING_SOFT = { damping: 26, stiffness: 180, mass: 1 } as const;
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

export const enterUp = (index = 0) =>
  FadeInDown.duration(420)
    .delay(40 + index * 45)
    .easing(EASE_OUT)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] });

export const fadeIn = (delay = 0) => FadeIn.duration(260).delay(delay);
export const fadeOut = FadeOut.duration(180);
export const layout = LinearTransition.duration(260).easing(EASE_OUT);
