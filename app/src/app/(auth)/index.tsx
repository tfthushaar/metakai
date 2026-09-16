import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickAndRestoreBackup } from '../../core/backup';
import { getActivePhase, getProfile } from '../../core/db/repo';
import { connectDrive, restoreFromDrive } from '../../core/drive';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { Button } from '../../ui/Button';
import { enterUp } from '../../ui/motion';
import { Ring } from '../../ui/Ring';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';

function LogoRings() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.logo}>
      <Ring size={156} stroke={12} progress={0.78} color={colors.accent}>
        <Ring size={116} stroke={12} progress={0.62} color={colors.text}>
          <Ring size={76} stroke={12} progress={0.45} color={colors.textSecondary} />
        </Ring>
      </Ring>
    </Animated.View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const setSettings = useSettings((s) => s.set);
  const [restoring, setRestoring] = useState<'drive' | 'file' | null>(null);

  /** After a restore, skip onboarding when the backup brought a profile. */
  const finishRestore = () => {
    const onboarded = getProfile() != null && getActivePhase() != null;
    setSettings({ authMode: 'guest', onboarded });
    if (!onboarded) toast('Backup restored. Finish setting up your goal.');
  };

  const fromDrive = async () => {
    setRestoring('drive');
    try {
      const email = await connectDrive();
      if (!email) return;
      setSettings({ drive: { ...useSettings.getState().drive, email } });
      if (await restoreFromDrive()) finishRestore();
      else toast(`No Metakai backup found in ${email}'s Drive.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore from Google Drive.');
    } finally {
      setRestoring(null);
    }
  };

  const fromFile = async () => {
    setRestoring('file');
    try {
      if (await pickAndRestoreBackup()) finishRestore();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore that file.');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.hero}>
        <LogoRings />
        <Animated.View entering={enterUp(2)} style={{ alignItems: 'center' }}>
          <Text variant="display" align="center">
            metakai
          </Text>
          <Text variant="title3" tone="secondary" align="center" weight="medium" style={{ marginTop: 6 }}>
            Build the body you want.
          </Text>
        </Animated.View>
        <Animated.View entering={enterUp(3)}>
          <Text variant="subhead" tone="tertiary" align="center" style={{ marginTop: SPACE.lg, maxWidth: 300 }}>
            Food, weight and progress in one place. Cut, bulk or recomp.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={enterUp(5)} style={styles.actions}>
        <Button title="Get started" onPress={() => setSettings({ authMode: 'guest' })} />
        <Button title="Restore from Google Drive" variant="gray" icon="cloud" onPress={fromDrive} loading={restoring === 'drive'} disabled={restoring != null} />
        <Button title="Restore from a backup file" variant="plain" onPress={fromFile} loading={restoring === 'file'} disabled={restoring != null} />
        <Text variant="footnote" tone="tertiary" align="center">
          No account needed. Your data stays on this phone, with optional backup to your own Google Drive.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { marginBottom: SPACE.xxxl },
  actions: { gap: SPACE.md },
});
