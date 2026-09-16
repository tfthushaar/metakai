import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useSettings } from './store/settings';
import { useTheme } from './theme/ThemeProvider';

/** Re-lock after the app has been in the background this long. */
const RELOCK_AFTER_MS = 30_000;

export async function biometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  return hardware && enrolled;
}

export async function authenticate(prompt = 'Unlock Metakai'): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, fallbackLabel: 'Use passcode' });
  return result.success;
}

export function AppLockGate() {
  const { colors } = useTheme();
  const enabled = useSettings((s) => s.appLock);
  const [locked, setLocked] = useState(enabled);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await authenticate()) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (locked && enabled) unlock();
  }, [locked, enabled, unlock]);

  if (!enabled || !locked) return null;
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.fill }]}>
        <Icon name="user" size={34} color={colors.text} />
      </View>
      <Text variant="title2">Metakai is locked</Text>
      <View style={{ width: 220 }}>
        <Button title="Unlock" onPress={unlock} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 100 },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
});
