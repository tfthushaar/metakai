import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDb } from '../core/db/database';
import { useSettings } from '../core/store/settings';
import { ThemeProvider, useTheme } from '../core/theme/ThemeProvider';
import { ToastHost } from '../ui/Toast';
import { AppLockGate } from '../core/AppLock';
import { syncReminders } from '../core/reminders';
import { backfillWorkoutCalories } from '../modules/workouts/repo';
import { flushDrive, syncDrive, watchForChanges } from '../core/drive';
import { restoreRecording } from '../modules/gps/tracker';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

getDb();
try {
  backfillWorkoutCalories();
} catch {}
restoreRecording().catch(() => {});

function useDriveBackup() {
  const enabled = useSettings((s) => s.drive.enabled);
  useEffect(() => {
    if (!enabled) return;
    syncDrive();
    const unwatch = watchForChanges();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') flushDrive();
      if (state === 'active') syncDrive();
    });
    return () => {
      unwatch();
      sub.remove();
    };
  }, [enabled]);
}

function useNotificationLinks() {
  const router = useRouter();
  useEffect(() => {
    syncReminders().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('metakai://')) router.push(`/${url.slice('metakai://'.length)}` as never);
    });
    return () => sub.remove();
  }, [router]);
}

function RootStack() {
  const { colors, dark } = useTheme();
  useNotificationLinks();
  useDriveBackup();
  const authMode = useSettings((s) => s.authMode);
  const onboarded = useSettings((s) => s.onboarded);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const modal = { presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true } as const;

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'ios_from_right',
        }}
      >
        <Stack.Protected guard={authMode === 'none'}>
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={authMode !== 'none' && !onboarded}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={authMode !== 'none' && onboarded}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="log-food" options={modal} />
          <Stack.Screen name="log-weight" options={modal} />
          <Stack.Screen name="quick-add" options={modal} />
          <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="workout-summary" />
          <Stack.Screen name="exercises" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="exercise" />
          <Stack.Screen name="routine" />
          <Stack.Screen name="plates" options={modal} />
          <Stack.Screen name="body" />
          <Stack.Screen name="log-measurements" options={modal} />
          <Stack.Screen name="log-bodyfat" options={modal} />
          <Stack.Screen name="photos" />
          <Stack.Screen name="compare" options={{ animation: 'fade' }} />
          <Stack.Screen name="milestones" />
          <Stack.Screen name="habits" />
          <Stack.Screen name="split" />
          <Stack.Screen name="overload" />
          <Stack.Screen name="quick-workout" options={modal} />
          <Stack.Screen name="log-cardio" options={modal} />
          <Stack.Screen name="record" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="activity" />
          <Stack.Screen name="interval-timer" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="recovery" />
          <Stack.Screen name="health" />
          <Stack.Screen name="marker" />
          <Stack.Screen name="log-marker" options={modal} />
          <Stack.Screen name="physique" />
          <Stack.Screen name="checkin" />
          <Stack.Screen name="volume" />
          <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="goal" />
          <Stack.Screen name="targets" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
      </Stack>
      <ToastHost />
      <AppLockGate />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
