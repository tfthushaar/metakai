import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usesAppleSignIn } from '../core/apple';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { joinLeaderboards, syncScores } from '../modules/leaderboards/api';
import { COUNTRIES, countryName, flag } from '../modules/leaderboards/countries';
import { currentPhysiqueRank, currentRunRank } from '../modules/ranks/repo';
import { usePerson } from '../modules/ranks/usePerson';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ListGroup, ListRow } from '../ui/List';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

export default function LeaderboardJoin() {
  const { colors, dark } = useTheme();
  const router = useRouter();
  const person = usePerson();
  const lb = useSettings((s) => s.leaderboard);
  const editing = lb.joined;
  const [name, setName] = useState(lb.displayName ?? '');
  const [country, setCountry] = useState<string | null>(lb.country);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : COUNTRIES;
  }, [query]);

  const join = async () => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await joinLeaderboards({ displayName: name.trim(), country }, person);
      await syncScores(person, currentPhysiqueRank(person), currentRunRank(person), true).catch(() => false);
      haptic.success();
      toast(editing ? 'Saved' : 'You’re on the leaderboards');
      if (editing) router.back();
      else router.replace('/leaderboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join right now.');
    } finally {
      setBusy(false);
    }
  };

  if (picking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen title="Country" back>
          <TextField value={query} onChangeText={setQuery} placeholder="Search" autoFocus autoCorrect={false} />
          <View style={{ height: SPACE.md }} />
          <ListGroup>
            <ListRow
              title="Don’t show a country"
              selected={country == null}
              chevron={false}
              onPress={() => {
                setCountry(null);
                setPicking(false);
              }}
            />
            {matches.slice(0, 60).map((c) => (
              <ListRow
                key={c.code}
                title={`${flag(c.code)}  ${c.name}`}
                selected={country === c.code}
                chevron={false}
                onPress={() => {
                  setCountry(c.code);
                  setPicking(false);
                  setQuery('');
                }}
              />
            ))}
          </ListGroup>
          {matches.length > 60 && (
            <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.lg }}>
              Type to find more countries.
            </Text>
          )}
        </Screen>
      </View>
    );
  }

  return (
    <Screen title={editing ? 'Leaderboard profile' : 'Join leaderboards'} back>
      {!editing && (
        <Text variant="subhead" tone="secondary">
          Compare your Physique and Run pass ranks with other people. You can leave at any time and everything you shared is deleted.
        </Text>
      )}

      <View style={{ marginTop: SPACE.xl, gap: SPACE.md }}>
        <TextField label="Display name" value={name} onChangeText={setName} placeholder="e.g. IronFalcon" autoCapitalize="none" autoCorrect={false} maxLength={20} />
        <PressableScale scaleTo={0.99} onPress={() => setPicking(true)} style={[styles.picker, { backgroundColor: colors.fill }]}>
          <Text variant="body" style={{ flex: 1 }} tone={country ? 'primary' : 'tertiary'}>
            {country ? `${flag(country)}  ${countryName(country)}` : 'Country (optional)'}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </PressableScale>
        {error && (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        )}
      </View>

      {!editing && (
        <>
          <ListGroup header="Shared">
            <ListRow icon="user" title="Your display name and country" />
            <ListRow icon="ruler" title="Sex, age group, weight class and height band" subtitle="Rounded buckets, never exact numbers" />
            <ListRow icon="trophy" title="Pass scores and GPS run times" />
          </ListGroup>
          <ListGroup header="Never shared" footer={`Signing in with ${usesAppleSignIn ? 'Apple' : 'Google'} proves you’re a real person. Metakai stores a one-way code, not your email.`}>
            <ListRow icon="lock" title="Food, weigh-ins, photos, routes, health data and your email" />
          </ListGroup>
        </>
      )}

      <View style={{ marginTop: SPACE.xl }}>
        {usesAppleSignIn && !editing ? (
          <View style={{ opacity: !person || name.trim().length < 3 || busy ? 0.4 : 1 }} pointerEvents={!person || name.trim().length < 3 || busy ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={RADIUS.lg}
              style={{ height: 54 }}
              onPress={join}
            />
          </View>
        ) : (
          <Button title={editing ? 'Save' : 'Continue with Google'} onPress={join} loading={busy} disabled={!person || name.trim().length < 3} />
        )}
        {!person && (
          <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: SPACE.sm }}>
            Log a weigh-in first so you’re placed in the right weight class.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg, minHeight: 50 },
});
