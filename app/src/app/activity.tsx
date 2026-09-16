import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { cardioLabel } from '../lib/cardio';
import { formatLong } from '../lib/dates';
import { durationLabel, type TrackKind } from '../lib/geo';
import { bestEfforts, deleteCardio, getCardio, renameCardio } from '../modules/cardio/repo';
import { BestEffortsList, distanceParts, elevationLabel, paceOrSpeed, RouteArt, SplitsList, StatCell } from '../modules/gps/components';
import { hasBestEfforts } from '../modules/gps/summary';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

export default function Activity() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const metric = useSettings((s) => s.units) === 'metric';
  const session = useQuery(['cardio_sessions'], () => getCardio(id), [id]);
  const previous = useMemo(() => (session ? bestEfforts(session.kind, session.id) : {}), [session]);
  const [editing, setEditing] = useState<string | null>(null);

  if (!session) {
    return (
      <Screen title="Activity" back>
        <Text variant="subhead" tone="secondary">
          This activity was deleted.
        </Text>
      </Screen>
    );
  }

  const distanceM = (session.distanceKm ?? 0) * 1000;
  const movingSec = session.durationMin * 60;
  const dist = distanceParts(distanceM, metric);
  const avg = paceOrSpeed(session.kind, movingSec, distanceM, metric);
  const cardW = width - SPACE.lg * 2;
  const name = session.title ?? cardioLabel(session.kind);

  const confirmDelete = () =>
    Alert.alert('Delete activity?', 'This removes it from your history and stats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCardio(session.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen
      title={name}
      subtitle={`${cardioLabel(session.kind)} · ${formatLong(session.dateKey)}`}
      back
      accessory={
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <PressableScale feedback="selection" onPress={() => setEditing(editing == null ? name : null)} style={[styles.round, { backgroundColor: colors.fill }]}>
            <Icon name="pencil" size={16} color={colors.text} />
          </PressableScale>
          <PressableScale feedback="selection" onPress={confirmDelete} style={[styles.round, { backgroundColor: colors.fill }]}>
            <Icon name="trash" size={17} color={colors.text} />
          </PressableScale>
        </View>
      }
    >
      {editing != null && (
        <TextInput
          value={editing}
          onChangeText={setEditing}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            renameCardio(session.id, editing);
            setEditing(null);
          }}
          onBlur={() => setEditing(null)}
          selectionColor={colors.accent}
          style={[TYPE.headline, styles.rename, { color: colors.text, backgroundColor: colors.surface }]}
          maxLength={60}
        />
      )}

      {session.route && (
        <View style={[styles.route, { backgroundColor: colors.surface }]}>
          <RouteArt encoded={session.route} width={cardW} height={260} strokeWidth={4} />
        </View>
      )}

      <View style={[styles.grid, { backgroundColor: colors.surface }]}>
        <StatCell label="Distance" value={dist.value} unit={dist.unit} big />
        <StatCell label="Moving time" value={durationLabel(movingSec)} big />
        <StatCell label={avg.label} value={avg.value} unit={avg.unit} big />
        {session.elevationM != null && <StatCell label="Elevation" value={elevationLabel(session.elevationM, metric)} />}
        {session.kcal != null && <StatCell label="Calories" value={`≈ ${Math.round(session.kcal)}`} />}
        {session.elapsedMin != null && <StatCell label="Elapsed" value={durationLabel(session.elapsedMin * 60)} />}
      </View>

      {session.splits && hasBestEfforts(session.kind as TrackKind) && Object.keys(session.splits.best).length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text variant="headline">Best efforts</Text>
          <BestEffortsList best={session.splits.best} previous={previous} />
        </View>
      )}

      {session.splits && session.splits.splits.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text variant="headline" style={{ marginBottom: SPACE.sm }}>
            Splits
          </Text>
          <SplitsList data={session.splits} kind={session.kind} metric={metric} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rename: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, marginBottom: SPACE.md },
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  route: { height: 260, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: SPACE.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderRadius: RADIUS.xl },
  section: { padding: SPACE.lg, borderRadius: RADIUS.xl, marginTop: SPACE.md },
});
