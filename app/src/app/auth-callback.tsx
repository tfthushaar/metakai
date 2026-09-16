import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { handleAuthUrl, useAuth } from '../core/auth/auth';
import { useTheme } from '../core/theme/ThemeProvider';
import { toast } from '../ui/Toast';

/** Landing route for metakai://auth-callback deep links (magic links, email confirmation). */
export default function AuthCallback() {
  const { colors } = useTheme();
  const router = useRouter();
  const url = Linking.useLinkingURL();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (url && !useAuth.getState().session) await handleAuthUrl(url);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Sign-in link is invalid or expired.');
      }
      if (!cancelled) router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
  }, [url, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
