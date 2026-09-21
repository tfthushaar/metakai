// One import per weight: the package index would bundle all 18 Inter files.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, View } from 'react-native';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDb } from '../core/db/database';
import { prepareDb } from '../core/db/engine';
import { useSignInReturn } from '../core/signInReturn';
import { useSettings } from '../core/store/settings';
import { ThemeProvider, useTheme } from '../core/theme/ThemeProvider';
import { ToastHost } from '../ui/Toast';
import { AppLockGate } from '../core/AppLock';
import { onNotificationOpened } from '../core/notify';
import { syncReminders } from '../core/reminders';
import { backfillWorkoutCalories } from '../modules/workouts/repo';
import { flushDrive, syncDrive, watchForChanges } from '../core/drive';
import { useWidgetRefresh } from '../widgets/refresh';
import { useWatchAutoSync } from '../modules/wearables/sync';
import { restoreRecording } from '../modules/gps/tracker';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

/** Opens the database and tidies up; on phones at load, on the web once the browser engine is ready. */
function startup() {
  getDb();
  try {
    backfillWorkoutCalories();
  } catch {}
  if (Platform.OS !== 'web') restoreRecording().catch(() => {});
}
if (Platform.OS !== 'web') startup();

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

// Links from widgets and notifications that open a screen directly still have the tabs underneath.
export const unstable_settings = { initialRouteName: '(tabs)' };

function useNotificationLinks() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    syncReminders().catch(() => {});
    // Switching a feature on or off changes which reminders are sent.
    const unwatch = useSettings.subscribe((state, before) => {
      if (state.enabledModules !== before.enabledModules) syncReminders().catch(() => {});
    });
    const stop = onNotificationOpened((url) => router.push(`/${url.slice('metakai://'.length)}` as never));
    return () => {
      unwatch();
      stop();
    };
  }, [router]);
}

function RootStack() {
  const { colors, dark } = useTheme();
  useNotificationLinks();
  useSignInReturn();
  useDriveBackup();
  useWatchAutoSync();
  useWidgetRefresh();
  const authMode = useSettings((s) => s.authMode);
  const onboarded = useSettings((s) => s.onboarded);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const modal = { presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true } as const;

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {reduceMotion && <ReducedMotionConfig mode={ReduceMotion.Always} />}
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
          <Stack.Screen name="log-entry" options={modal} />
          <Stack.Screen name="recipes" />
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
          <Stack.Screen name="rank-physique" />
          <Stack.Screen name="rank-run" />
          <Stack.Screen name="achievements" />
          <Stack.Screen name="share-card" options={modal} />
          <Stack.Screen name="leaderboard" />
          <Stack.Screen name="leaderboard-join" />
          <Stack.Screen name="leaderboard-account" />
          <Stack.Screen name="interval-timer" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="recovery" />
          <Stack.Screen name="health" />
          <Stack.Screen name="overview" />
          <Stack.Screen name="start-workout" options={{ animation: 'none' }} />
          <Stack.Screen name="oauth2redirect" options={{ animation: 'none' }} />
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
      {Platform.OS !== 'web' && <AppLockGate />}
    </>
  );
}

/** Web: a phone-width column on wide screens, so desktop browsers show the app as it is on a phone. */
function WebFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  if (Platform.OS !== 'web') return children;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [dbReady, setDbReady] = useState(Platform.OS !== 'web');
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (dbReady) return;
    prepareDb()
      .then(() => {
        startup();
        setDbReady(true);
      })
      .catch((e) => setDbError(e instanceof Error ? e.message : 'Could not open your data.'));
  }, [dbReady]);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (dbError) throw new Error(dbError);
  if ((!fontsLoaded && !fontError) || !dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <WebFrame>
            <RootStack />
          </WebFrame>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
