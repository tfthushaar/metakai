import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { finishGoogleLeaderboardSignIn, LEADERBOARD_SIGN_IN } from '../modules/leaderboards/api';
import { toast } from '../ui/Toast';
import { getActivePhase, getProfile } from './db/repo';
import { DRIVE_SIGN_IN, restoreFromDrive, syncDrive, useDrive } from './drive';
import { currentGoogleUser, resumeGoogleSignIn } from './google';
import { useSettings } from './store/settings';

/** Drive sign-in finished: restore onto a fresh browser, or connect and back up. */
async function finishDrive() {
  const email = (await currentGoogleUser())?.email ?? null;
  const settings = useSettings.getState();
  if (!settings.onboarded) {
    settings.set({ drive: { ...settings.drive, email } });
    if (await restoreFromDrive()) {
      const onboarded = getProfile() != null && getActivePhase() != null;
      useSettings.getState().set({ authMode: 'guest', onboarded });
      toast(onboarded ? 'Restored from Google Drive' : 'Backup restored. Finish setting up your goal.');
    } else {
      toast(`No Metakai backup found in ${email ? `${email}'s` : 'this'} Drive.`);
    }
    return;
  }
  settings.set({ drive: { ...settings.drive, enabled: true, email } });
  await syncDrive();
  toast(useDrive.getState().error ?? 'Backed up to Google Drive');
}

/**
 * Web: Google sign-in leaves the page and comes back. This finishes whatever the sign-in was for
 * and returns to the screen it started from. Phones sign in without leaving the app, so it does nothing there.
 */
export function useSignInReturn() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      let back: Awaited<ReturnType<typeof resumeGoogleSignIn>> = null;
      try {
        back = await resumeGoogleSignIn();
        if (!back) return;
        if (back.purpose === DRIVE_SIGN_IN) await finishDrive();
        else if (back.purpose === LEADERBOARD_SIGN_IN) await finishGoogleLeaderboardSignIn();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Google sign-in failed. Try again.');
      }
      if (back && back.returnTo !== '/' && useSettings.getState().onboarded) router.replace(back.returnTo as never);
    })();
  }, [router]);
}
