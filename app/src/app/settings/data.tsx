import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { clearAllData } from '../../core/db/database';
import { disconnectDrive } from '../../core/drive';
import { DEFAULT_DRIVE, useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';

export default function ManageData() {
  const router = useRouter();
  const { colors } = useTheme();
  const setSettings = useSettings((s) => s.set);
  const driveOn = useSettings((s) => s.drive.enabled);

  const erase = () =>
    Alert.alert('Erase all data?', 'This removes your profile, goals, logs and photos from this phone. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: async () => {
          if (driveOn) await disconnectDrive();
          clearAllData();
          setSettings({ authMode: 'none', onboarded: false, drive: DEFAULT_DRIVE });
        },
      },
    ]);

  return (
    <Screen title="Manage data" back>
      <Text variant="subhead" tone="secondary">
        Everything lives on this phone. Back it up to a file or your own Google Drive before switching phones.
      </Text>
      <ListGroup header="Backup">
        <ListRow icon="cloud" iconColor={colors.fill} title="Backup & sync" onPress={() => router.push('/settings/backup')} />
      </ListGroup>
      <ListGroup footer={driveOn ? 'Also disconnects Google Drive. The copy in your Drive is kept.' : undefined}>
        <ListRow title="Erase all data" destructive onPress={erase} chevron={false} />
      </ListGroup>
    </Screen>
  );
}
