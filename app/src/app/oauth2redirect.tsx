import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * The free-software build signs in to Google in a browser tab, which returns to the app on a
 * link ending in /oauth2redirect. The sign-in code reads that link itself; this screen only takes the
 * user back to where they were, instead of showing a page for it.
 */
export default function OAuthReturn() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
