import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signInWithGoogle } from '../../core/auth/auth';
import { cloudEnabled } from '../../core/auth/supabase';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { enterUp } from '../../ui/motion';
import { Ring } from '../../ui/Ring';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';

function LogoRings() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.logo}>
      <Ring size={156} stroke={12} progress={0.78} color={colors.accent}>
        <Ring size={116} stroke={12} progress={0.62} color={colors.text}>
          <Ring size={76} stroke={12} progress={0.45} color={colors.textSecondary} />
        </Ring>
      </Ring>
    </Animated.View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setSettings = useSettings((s) => s.set);
  const [googleLoading, setGoogleLoading] = useState(false);

  const google = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.hero}>
        <LogoRings />
        <Animated.View entering={enterUp(2)} style={{ alignItems: 'center' }}>
          <Text variant="display" align="center">
            metakai
          </Text>
          <Text variant="title3" tone="secondary" align="center" weight="medium" style={{ marginTop: 6 }}>
            Build the body you want.
          </Text>
        </Animated.View>
        <Animated.View entering={enterUp(3)}>
          <Text variant="subhead" tone="tertiary" align="center" style={{ marginTop: SPACE.lg, maxWidth: 300 }}>
            Food, weight and progress in one place. Cut, bulk or recomp.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={enterUp(5)} style={styles.actions}>
        <Button title="Continue with Google" onPress={google} loading={googleLoading} disabled={!cloudEnabled} />
        <Button title="Continue with email" variant="gray" icon="mail" onPress={() => router.push('/email-auth')} disabled={!cloudEnabled} />
        <Button title="Use without an account" variant="plain" onPress={() => setSettings({ authMode: 'guest' })} />
        <Text variant="footnote" tone="tertiary" align="center">
          {cloudEnabled
            ? 'Without an account your data stays on this phone. You can sign in later to sync.'
            : 'Cloud sign-in is not configured in this build. Your data stays on this phone.'}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { marginBottom: SPACE.xxxl },
  actions: { gap: SPACE.md },
});
