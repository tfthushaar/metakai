import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { exportBackup, pickAndRestoreBackup } from '../../core/backup';
import { connectDrive, deleteDriveBackup, disconnectDrive, syncDrive, useDrive } from '../../core/drive';
import { currentGoogleUser } from '../../core/google';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

const when = (iso: string) => new Date(iso).toLocaleString([], { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });

export default function BackupSettings() {
  const { colors } = useTheme();
  const drive = useSettings((s) => s.drive);
  const set = useSettings((s) => s.set);
  const status = useDrive();
  const [connecting, setConnecting] = useState(false);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const connect = async () => {
    setConnecting(true);
    try {
      const email = await connectDrive();
      if (!email) return;
      set({ drive: { ...drive, enabled: true, email } });
      await syncDrive();
      const { error } = useDrive.getState();
      toast(error ?? 'Backed up to Google Drive');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not connect Google Drive.');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () =>
    Alert.alert('Stop backing up?', 'Your data stays on this phone. You can keep the copy in Google Drive or delete it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Keep backup', onPress: () => disconnectDrive() },
      {
        text: 'Delete backup',
        style: 'destructive',
        onPress: () =>
          deleteDriveBackup()
            .then(() => toast('Backup deleted from Google Drive'))
            .catch((e) => toast(e instanceof Error ? e.message : 'Could not delete the backup.')),
      },
    ]);

  const backUpNow = async () => {
    // Web sign-ins last an hour; after that, backing up starts with signing in again.
    if (Platform.OS === 'web' && !(await currentGoogleUser())) {
      await connectDrive().catch((e) => toast(e instanceof Error ? e.message : 'Could not reach Google.'));
      return;
    }
    await syncDrive();
    toast(useDrive.getState().error ?? 'Backed up');
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const { records, photos } = await exportBackup(withPhotos);
      toast(`Backup ready · ${records.toLocaleString('en-US')} records${photos ? `, ${photos} photos` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the backup.');
    } finally {
      setBusy(null);
    }
  };

  const doImport = () =>
    Alert.alert('Restore a backup?', 'Records from the file are merged into this phone. Where both have the same record, the newer one is kept. Your profile, current goal and settings come from the backup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Choose file',
        onPress: async () => {
          setBusy('import');
          try {
            const result = await pickAndRestoreBackup();
            if (result) toast(`Restored ${result.records.toLocaleString('en-US')} records${result.photos ? ` and ${result.photos} photos` : ''}`);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not restore that file.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const statusText =
    status.status === 'syncing'
      ? 'Backing up…'
      : status.status === 'error'
        ? status.error
        : drive.lastSyncedAt
          ? `Last backed up ${when(drive.lastSyncedAt)}`
          : 'Not backed up yet';

  return (
    <Screen title="Backup & sync" back>
      <Text variant="subhead" tone="secondary">
        Your data lives on this phone. Keep a copy in your own Google Drive so you can restore it on a new phone or use Metakai on two phones.
      </Text>

      {drive.enabled ? (
        <>
          <ListGroup
            header="Google Drive"
            footer={
              Platform.OS === 'web'
                ? 'Backs up a few seconds after you make changes while you’re signed in. Google sign-ins on the web last an hour; after that, Back up now signs you in again.'
                : 'Backs up a few seconds after you make changes and when you leave the app. Photos upload once.'
            }
          >
            <ListRow icon="cloud" title={drive.email ?? 'Google account'} subtitle={statusText ?? undefined} />
            <ListRow icon="refresh" title="Back up now" onPress={backUpNow} chevron={false} />
          </ListGroup>
          <ListGroup>
            <ListRow title="Disconnect Google Drive" destructive onPress={disconnect} chevron={false} />
          </ListGroup>
        </>
      ) : (
        <View style={{ gap: SPACE.sm, marginTop: SPACE.xl }}>
          <Button title="Connect Google Drive" icon="cloud" onPress={connect} loading={connecting} />
          <Text variant="caption" tone="tertiary" align="center">
            Stored in a private app folder in your Drive. Metakai can’t see your other files.
          </Text>
        </View>
      )}

      <ListGroup header="Backup file" footer="Save the file anywhere, such as Files, email or another cloud. Restoring merges it into this phone.">
        {Platform.OS !== 'web' && <ListRow title="Include progress photos" accessory={<Toggle value={withPhotos} onChange={setWithPhotos} />} />}
        <ListRow icon="arrowUp" title={busy === 'export' ? 'Preparing…' : 'Export backup file'} onPress={busy ? undefined : doExport} chevron={false} />
        <ListRow icon="arrowDown" title={busy === 'import' ? 'Restoring…' : 'Restore from file'} onPress={busy ? undefined : doImport} chevron={false} />
      </ListGroup>
    </Screen>
  );
}
