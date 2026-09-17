import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

/** Sign in with Apple, used for leaderboards on iOS. No name or email is requested. */
export const usesAppleSignIn = Platform.OS === 'ios';

/** Returns null if the user cancelled. */
export async function signInWithApple(): Promise<{ identityToken: string; authorizationCode: string | null } | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
    return { identityToken: credential.identityToken, authorizationCode: credential.authorizationCode };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw e instanceof Error ? e : new Error('Apple sign-in failed. Try again.');
  }
}
