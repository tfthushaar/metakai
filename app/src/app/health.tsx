import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { dateKey, relativeDay } from '../lib/dates';
import {
  addSupplement,
  formatMarker,
  latestMarkers,
  listSupplements,
  MARKERS,
  markerName,
  removeSupplement,
  setTaken,
  SUPPLEMENT_SUGGESTIONS,
  takenOn,
  TIMING_LABEL,
  type SupplementTiming,
} from '../modules/health/repo';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const TIMINGS: SupplementTiming[] = ['morning', 'pre', 'post', 'evening', 'any'];

export default function Health() {
  const { colors } = useTheme();
  const router = useRouter();
  const today = dateKey();
  const supplements = useQuery(['supplements'], listSupplements);
  const taken = useQuery(['supplement_logs'], () => takenOn(today), [today]);
  const markers = useQuery(['health_markers'], latestMarkers);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [timing, setTiming] = useState<SupplementTiming>('any');

  const doneCount = supplements.filter((s) => taken.has(s.id)).length;
  const suggestions = SUPPLEMENT_SUGGESTIONS.filter((s) => !supplements.some((x) => x.name.toLowerCase() === s.name.toLowerCase()));

  const add = () => {
    if (!name.trim()) return;
    addSupplement({ name, dose, timing });
    haptic.success();
    setName('');
    setDose('');
  };

  const confirmRemove = (id: string, label: string) =>
    Alert.alert(`Remove ${label}?`, 'Past check-offs stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSupplement(id) },
    ]);

  return (
    <Screen title="Health" back>
      <SectionHeader
        title="Supplements"
        action={<Button title={editing ? 'Done' : supplements.length ? 'Edit' : 'Add'} size="sm" variant="tinted" full={false} onPress={() => setEditing(!editing)} />}
      />
      <Card index={0} padded={false}>
        {supplements.length === 0 && !editing ? (
          <View style={{ padding: SPACE.lg }}>
            <Text variant="subhead" tone="secondary">
              Add what you take and check it off each day.
            </Text>
          </View>
        ) : (
          <>
            {supplements.length > 0 && !editing && (
              <View style={[styles.head, { borderBottomColor: colors.separator }]}>
                <Text variant="subhead" tone="secondary">{`${doneCount} of ${supplements.length} taken today`}</Text>
              </View>
            )}
            {supplements.map((s, i) => {
              const on = taken.has(s.id);
              return (
                <Animated.View key={s.id} layout={layout} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                  <PressableScale
                    scaleTo={0.99}
                    feedback={editing ? 'none' : 'selection'}
                    onPress={() => (editing ? confirmRemove(s.id, s.name) : setTaken(s.id, today, !on))}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
                  >
                    <View style={[styles.check, { backgroundColor: on && !editing ? colors.accent : colors.fill }]}>
                      {editing ? <Icon name="minus" size={16} color={colors.danger} strokeWidth={3} /> : on && <Icon name="check" size={16} color={colors.onAccent} strokeWidth={3} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="body">{s.name}</Text>
                      <Text variant="caption" tone="tertiary">
                        {[s.dose, TIMING_LABEL[s.timing]].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </>
        )}
      </Card>

      {editing && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: SPACE.md, marginTop: SPACE.md }}>
          {suggestions.length > 0 && (
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Chip key={s.name} label={s.name} icon="plus" onPress={() => addSupplement(s)} />
              ))}
            </View>
          )}
          <Card style={{ gap: SPACE.md }}>
            <View style={styles.inputs}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.accent}
                style={[TYPE.body, styles.input, { flex: 2, color: colors.text, backgroundColor: colors.fill }]}
              />
              <TextInput
                value={dose}
                onChangeText={setDose}
                placeholder="Dose"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.accent}
                style={[TYPE.body, styles.input, { flex: 1, color: colors.text, backgroundColor: colors.fill }]}
              />
            </View>
            <View style={styles.chips}>
              {TIMINGS.map((t) => (
                <Chip key={t} label={TIMING_LABEL[t]} selected={timing === t} onPress={() => setTiming(t)} />
              ))}
            </View>
            <Button title="Add supplement" size="md" onPress={add} disabled={!name.trim()} />
          </Card>
        </Animated.View>
      )}

      <SectionHeader title="Health markers" action={<Button title="Log" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push('/log-marker')} />} />
      <Card index={1} padded={false}>
        {markers.length === 0 ? (
          <PressableScale scaleTo={0.99} onPress={() => router.push('/log-marker')} style={{ padding: SPACE.lg, gap: 4 }}>
            <Text variant="headline">Track what matters</Text>
            <Text variant="subhead" tone="secondary">
              Blood pressure, resting heart rate, HRV, fasting glucose, steps and lab results like vitamin D or cholesterol.
            </Text>
          </PressableScale>
        ) : (
          markers.map((m, i) => {
            const def = MARKERS.find((d) => d.kind === m.kind);
            const note = def?.check?.(m.value, m.value2) ?? null;
            const change = m.previous && m.kind !== 'bp' ? m.value - m.previous.value : null;
            return (
              <PressableScale
                key={m.id}
                scaleTo={0.99}
                onPress={() => router.push({ pathname: '/marker', params: { kind: m.kind, label: m.label ?? '' } })}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body">{markerName(m)}</Text>
                  <Text variant="caption" tone={note ? 'warning' : 'tertiary'}>
                    {note ?? relativeDay(m.dateKey)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="headline" tabular>
                    {formatMarker(m)}
                    <Text variant="footnote" tone="secondary">{` ${m.unit ?? def?.unit ?? ''}`}</Text>
                  </Text>
                  {change != null && change !== 0 && (
                    <Text variant="caption" tone="secondary" tabular>{`${change > 0 ? '↑' : '↓'} ${Math.abs(Math.round(change * 10) / 10)}`}</Text>
                  )}
                </View>
                <Icon name="chevronRight" size={16} color={colors.textTertiary} />
              </PressableScale>
            );
          })
        )}
      </Card>
      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        For tracking only. Ranges are general guides, not a diagnosis. Talk to a doctor about readings that worry you.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  inputs: { flexDirection: 'row', gap: SPACE.sm },
  input: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 10 },
});
