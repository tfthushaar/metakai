import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { addFriend, getMe, leaveLeaderboards, listFriends, removeFriend, type RemoteProfile } from '../modules/leaderboards/api';
import { countryName, flag } from '../modules/leaderboards/countries';
import { Button } from '../ui/Button';
import { ListGroup, ListRow } from '../ui/List';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

export default function LeaderboardAccount() {
  const { colors } = useTheme();
  const router = useRouter();
  const lb = useSettings((s) => s.leaderboard);
  const [profile, setProfile] = useState<RemoteProfile | null>(null);
  const [friends, setFriends] = useState<{ name: string; country: string | null }[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, f] = await Promise.all([getMe(), listFriends()]);
      setProfile(me.profile);
      setFriends(f.friends);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load your profile');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const res = await addFriend(code);
      toast(`Added ${res.name}`);
      setCode('');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that friend');
    } finally {
      setBusy(false);
    }
  };

  const remove = (name: string) =>
    Alert.alert(`Remove ${name}?`, 'You’ll no longer see each other on the friends board.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFriend(name).then(load) },
    ]);

  const leave = () =>
    Alert.alert('Leave leaderboards?', 'Your name, scores and friends are deleted from the server. Your data on this phone stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave and delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveLeaderboards();
            toast('Removed from leaderboards');
            router.back();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not reach the server');
          }
        },
      },
    ]);

  const friendCode = profile?.friendCode;

  return (
    <Screen title="Leaderboard profile" back>
      <ListGroup header="You">
        <ListRow title={lb.displayName ?? '—'} subtitle={lb.country ? `${flag(lb.country)} ${countryName(lb.country)}` : 'No country'} onPress={() => router.push('/leaderboard-join')} />
        {profile && <ListRow title="Buckets" subtitle={`${profile.sex === 'male' ? 'Men' : 'Women'} · age ${profile.ageGroup} · ${profile.weightClass} kg class · ${profile.heightBand} cm`} />}
      </ListGroup>

      <ListGroup header="Friends" footer="Share your code with a friend. When either of you adds the other’s code, you both appear on each other’s friends board.">
        <ListRow
          icon="share"
          title={friendCode ? `Your code: ${friendCode}` : 'Loading your code…'}
          subtitle="Tap to share"
          onPress={
            friendCode
              ? async () => {
                  await Clipboard.setStringAsync(friendCode);
                  Share.share({ message: `Add me on Metakai leaderboards with code ${friendCode}` }).catch(() => {});
                }
              : undefined
          }
          chevron={false}
        />
        {friends.map((f) => (
          <ListRow key={f.name} title={`${flag(f.country)} ${f.name}`.trim()} subtitle="Tap to remove" onPress={() => remove(f.name)} chevron={false} />
        ))}
      </ListGroup>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Friend’s code" autoCapitalize="characters" autoCorrect={false} maxLength={8} />
        </View>
        <Button title="Add" full={false} onPress={add} loading={busy} disabled={code.trim().length < 8} />
      </View>

      <ListGroup>
        <ListRow title="Leave leaderboards" destructive onPress={leave} chevron={false} />
      </ListGroup>
      <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: SPACE.lg }}>
        Leaving deletes your name, scores and friend links from the server straight away.
      </Text>
    </Screen>
  );
}
