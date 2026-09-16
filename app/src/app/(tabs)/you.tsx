import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../core/auth/auth';
import { useBody } from '../../core/goals/useBody';
import { ACCENTS } from '../../core/theme/palette';
import { useSettings } from '../../core/store/settings';
import { useSync } from '../../core/sync/sync';
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
  const session = useAuth((s) => s.session);
  const lastSynced = useSync((s) => s.lastSyncedAt);

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
            <Text variant="title3">{profile?.name || (session?.user.email ?? 'Your profile')}</Text>
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
        {settings.enabledModules.includes('workouts') && (
          <ListRow icon="dumbbell" iconColor={colors.text} title="Gym" value={`Rest ${settings.gym.restSeconds}s`} onPress={() => router.push('/settings/gym')} />
        )}
      </ListGroup>

      <ListGroup header="Account" index={3}>
        <ListRow
          icon={session ? 'cloud' : 'cloudOff'}
          iconColor={session ? colors.success : colors.fill}
          title={session ? 'Account & sync' : 'Sign in to sync'}
          subtitle={session ? (lastSynced ? `Synced ${new Date(lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet') : 'Your data is only on this phone'}
          onPress={() => router.push('/settings/account')}
        />
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
