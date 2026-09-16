import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { deleteAccount, signInWithGoogle, signOut, useAuth } from '../../core/auth/auth';
import { cloudEnabled } from '../../core/auth/supabase';
import { clearAllData, resetSyncState } from '../../core/db/database';
import { useSettings } from '../../core/store/settings';
import { syncNow, useSync } from '../../core/sync/sync';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';

export default function AccountSettings() {
  const router = useRouter();
  const { colors } = useTheme();
  const session = useAuth((s) => s.session);
  const sync = useSync();
  const setSettings = useSettings((s) => s.set);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    try {
      if (await signInWithGoogle()) toast('Signed in. Syncing your data…');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Choose whether to keep this phone’s copy of your data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Keep data on phone',
        onPress: async () => {
          await syncNow();
          await signOut();
          resetSyncState();
          setSettings({ authMode: 'guest' });
        },
      },
      {
        text: 'Remove from phone',
        style: 'destructive',
        onPress: async () => {
          await syncNow();
          await signOut();
          clearAllData();
          setSettings({ authMode: 'none', onboarded: false });
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert('Delete account?', 'Your account, goals, logs and weigh-ins will be permanently deleted from the cloud and this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            clearAllData();
            setSettings({ authMode: 'none', onboarded: false });
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not delete account. Try again when online.');
          }
        },
      },
    ]);
  };

  const resetLocal = () => {
    Alert.alert('Erase all data?', 'This removes your profile, goals and logs from this phone. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: () => {
          clearAllData();
          setSettings({ authMode: 'none', onboarded: false });
        },
      },
    ]);
  };

  if (!session) {
    return (
      <Screen title="Account" back>
        <Text variant="subhead" tone="secondary">
          {cloudEnabled
            ? 'Sign in to back up your data and use it on other devices. Everything you logged so far will be uploaded to your account.'
            : 'Cloud sync is not configured in this build. Your data is stored only on this phone.'}
        </Text>
        {cloudEnabled && (
          <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
            <Button title="Continue with Google" onPress={google} loading={busy} />
            <Button title="Continue with email" variant="gray" icon="mail" onPress={() => router.push('/email-auth')} />
          </View>
        )}
        <ListGroup header="Data">
          <ListRow title="Erase all data" destructive onPress={resetLocal} chevron={false} />
        </ListGroup>
      </Screen>
    );
  }

  const statusText =
    sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'offline'
        ? 'Offline. Changes will sync later.'
        : sync.status === 'error'
          ? `Sync error: ${sync.error}`
          : sync.lastSyncedAt
            ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString([], { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`
            : 'Not synced yet';

  return (
    <Screen title="Account" back>
      <ListGroup header="Signed in">
        <ListRow icon="mail" iconColor={colors.text} title={session.user.email ?? 'Account'} subtitle={`via ${session.user.app_metadata.provider ?? 'email'}`} />
      </ListGroup>

      <ListGroup header="Sync" footer="Metakai works offline and syncs automatically when you are online.">
        <ListRow icon="refresh" title="Sync now" subtitle={statusText} onPress={() => syncNow()} chevron={false} />
      </ListGroup>

      <ListGroup>
        <ListRow icon="logOut" iconColor={colors.fill} title="Sign out" onPress={confirmSignOut} chevron={false} />
      </ListGroup>

      <ListGroup footer="Deletes your account and every synced record. This cannot be undone.">
        <ListRow title="Delete account" destructive onPress={confirmDelete} chevron={false} />
      </ListGroup>
    </Screen>
  );
}
