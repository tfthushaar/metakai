import { GoogleSignin, isErrorWithCode, statusCodes, type User } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

/** Shared Google sign-in for Drive backup and leaderboards. Scopes are requested by each feature when needed. */

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;

let configured = false;
export function configureGoogle() {
  if (configured) return;
  // The web client ID lets Google issue ID tokens that the leaderboard server can verify.
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined, iosClientId: IOS_CLIENT_ID });
  configured = true;
}

export function googleError(e: unknown, what: string): string {
  if (isErrorWithCode(e)) {
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return `Google Play services are needed for ${what}.`;
    if (e.code === statusCodes.IN_PROGRESS) return 'Sign-in is already open.';
    if (String(e.code) === '10' || /DEVELOPER_ERROR/.test(e.message)) return `${what[0].toUpperCase()}${what.slice(1)} is not set up in this build yet.`;
  }
  return e instanceof Error ? e.message : `Couldn't reach Google. Try again.`;
}

/** Interactive sign-in. Returns null if the user cancelled. */
export async function signInWithGoogle(what: string): Promise<User | null> {
  if (Platform.OS === 'ios' && !IOS_CLIENT_ID) throw new Error(`${what[0].toUpperCase()}${what.slice(1)} is not set up in this build yet.`);
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    return res.type === 'success' ? res.data : null;
  } catch (e) {
    throw new Error(googleError(e, what));
  }
}

/** The signed-in user without showing any UI, or null. */
export async function currentGoogleUser(): Promise<User | null> {
  configureGoogle();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  try {
    const res = await GoogleSignin.signInSilently();
    return res.type === 'success' ? res.data : null;
  } catch {
    return null;
  }
}

export async function googleTokens(): Promise<{ accessToken: string; idToken: string | null }> {
  if (!(await currentGoogleUser())) throw new Error('Sign in with Google again.');
  const t = await GoogleSignin.getTokens();
  return { accessToken: t.accessToken, idToken: t.idToken ?? null };
}

export async function clearGoogleToken(token: string) {
  await GoogleSignin.clearCachedAccessToken(token).catch(() => {});
}

export async function signOutGoogle() {
  configureGoogle();
  await GoogleSignin.signOut().catch(() => {});
}
