import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { hasAiKey, useAiKeys } from '../../core/aiKey';
import { useBody } from '../../core/goals/useBody';
import { ACCENTS } from '../../core/theme/palette';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { ageFromBirthDate } from '../../lib/energy';
import { GOALS } from '../../lib/goals';
import { cmToFtIn, displayWeight, weightUnit } from '../../lib/units';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';

export default function You() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, phase, targets, currentKg } = useBody();
  const settings = useSettings();
  const aiKeys = useAiKeys();

  const goal = phase ? GOALS[phase.goalType] : null;
  const height = profile
    ? settings.units === 'metric'
      ? `${Math.round(profile.heightCm)} cm`
      : (() => {
          const { ft, inches } = cmToFtIn(profile.heightCm);
          return `${ft}′${inches}″`;
        })()
    : '';

  const appearanceLabel = `${settings.appearance[0].toUpperCase()}${settings.appearance.slice(1)} · ${ACCENTS[settings.accent].name}`;

  return (
    <Screen title="You" tabBar>
      <Card index={0} onPress={() => router.push('/settings/profile')}>
        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Icon name="user" size={28} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3">{profile?.name || 'Your profile'}</Text>
            {profile && (
              <Text variant="subhead" tone="secondary">
                {[
                  `${ageFromBirthDate(profile.birthDate)} yrs`,
                  height,
                  currentKg != null ? `${displayWeight(currentKg, settings.units)} ${weightUnit(settings.units)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>
          <Icon name="chevronRight" size={18} color={colors.textTertiary} />
        </View>
      </Card>

      <ListGroup header="Plan" index={1}>
        <ListRow
          icon="target"
          title="Goal"
          value={goal ? goal.title : 'Not set'}
          onPress={() => router.push('/goal')}
        />
        <ListRow icon="flame" iconColor={colors.text} title="Nutrition targets" value={targets ? `${targets.kcal} kcal` : undefined} onPress={() => router.push('/targets')} />
      </ListGroup>

      <ListGroup header="App" index={2}>
        <ListRow icon="grid" iconColor={colors.text} title="Features" value={settings.preset === 'custom' ? 'Custom' : undefined} onPress={() => router.push('/settings/features')} />
        <ListRow icon="palette" title="Appearance" value={appearanceLabel} onPress={() => router.push('/settings/appearance')} />
        <ListRow icon="home" iconColor={colors.text} title="Layout" subtitle="Sections, shortcuts and start screen" onPress={() => router.push('/settings/customize')} />
        {settings.enabledModules.includes('habits') && (
          <ListRow icon="check" iconColor={colors.fill} title="Habits" onPress={() => router.push('/habits')} />
        )}
        <ListRow icon="timer" iconColor={colors.fill} title="Reminders" value={Object.values(settings.reminders).filter((r) => r.on).length ? 'On' : 'Off'} onPress={() => router.push('/settings/reminders')} />
        <ListRow icon="user" iconColor={colors.fill} title="Privacy" value={settings.appLock ? 'Locked' : undefined} onPress={() => router.push('/settings/privacy')} />
        {settings.enabledModules.includes('workouts') && (
          <ListRow icon="dumbbell" iconColor={colors.text} title="Gym" value={`Rest ${settings.gym.restSeconds}s`} onPress={() => router.push('/settings/gym')} />
        )}
      </ListGroup>

      <ListGroup header="Data" index={3}>
        <ListRow
          icon={settings.drive.enabled ? 'cloud' : 'cloudOff'}
          iconColor={settings.drive.enabled ? colors.success : colors.fill}
          title="Backup & sync"
          subtitle={
            settings.drive.enabled
              ? settings.drive.lastSyncedAt
                ? `Google Drive · ${new Date(settings.drive.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : 'Google Drive'
              : 'Only on this phone'
          }
          onPress={() => router.push('/settings/backup')}
        />
        <ListRow icon="sparkles" title="AI" value={hasAiKey(aiKeys) ? 'On' : 'Off'} onPress={() => router.push('/settings/ai')} />
          <ListRow icon="trash" iconColor={colors.fill} title="Manage data" onPress={() => router.push('/settings/data')} />
      </ListGroup>

      <Text variant="footnote" tone="tertiary" align="center" style={{ marginTop: SPACE.xxl }}>
        {`Metakai ${Constants.expoConfig?.version ?? ''}`}
      </Text>
      <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: 4, paddingHorizontal: SPACE.xl }}>
        Estimates only, not medical advice.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  avatar: { width: 56, height: 56, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
});
