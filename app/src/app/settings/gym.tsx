import { View } from 'react-native';

import { DEFAULT_GYM, useSettings } from '../../core/store/settings';
import { SPACE } from '../../core/theme/typography';
import { weightUnit } from '../../lib/units';
import { formatWeight } from '../../modules/workouts/components';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';
import { Toggle } from '../../ui/Toggle';

const ALL_PLATES = [50, 25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
const BARS = [20, 15, 10, 7];
const RESTS = [60, 90, 120, 180, 240];
const INCREMENTS = [1, 1.25, 2.5, 5];

export default function GymSettings() {
  const units = useSettings((s) => s.units);
  const gym = useSettings((s) => s.gym);
  const set = useSettings((s) => s.set);
  const wu = weightUnit(units);
  const update = (patch: Partial<typeof gym>) => set({ gym: { ...gym, ...patch } });

  const togglePlate = (w: number) => {
    const has = gym.plates.some((p) => p.weight === w);
    const plates = has ? gym.plates.filter((p) => p.weight !== w) : [...gym.plates, { weight: w, pairs: 4 }].sort((a, b) => b.weight - a.weight);
    if (plates.length) update({ plates });
  };

  return (
    <Screen title="Gym" back>
      <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: SPACE.lg, marginBottom: SPACE.sm }}>
        DEFAULT REST
      </Text>
      <SegmentedControl
        value={String(gym.restSeconds)}
        onChange={(v) => update({ restSeconds: Number(v) })}
        segments={RESTS.map((r) => ({ value: String(r), label: r < 120 ? `${r}s` : `${r / 60}m` }))}
      />

      <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: SPACE.lg, marginTop: SPACE.xl, marginBottom: SPACE.sm }}>
        BARBELL
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        {BARS.map((b) => (
          <Chip key={b} label={`${formatWeight(b, units)} ${wu}`} selected={gym.barKg === b} onPress={() => update({ barKg: b })} />
        ))}
      </View>

      <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: SPACE.lg, marginTop: SPACE.xl, marginBottom: SPACE.sm }}>
        PLATES AVAILABLE
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        {ALL_PLATES.map((w) => (
          <Chip key={w} label={`${formatWeight(w, units)}`} selected={gym.plates.some((p) => p.weight === w)} onPress={() => togglePlate(w)} />
        ))}
      </View>

      <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: SPACE.lg, marginTop: SPACE.xl, marginBottom: SPACE.sm }}>
        SMALLEST JUMP
      </Text>
      <SegmentedControl
        value={String(gym.incrementKg)}
        onChange={(v) => update({ incrementKg: Number(v) })}
        segments={INCREMENTS.map((i) => ({ value: String(i), label: `${formatWeight(i, units)} ${wu}` }))}
      />

      <ListGroup header="During workouts">
        <ListRow title="Keep screen on" subtitle="Prevents the phone from sleeping mid-set" accessory={<Toggle value={gym.keepAwake} onChange={(keepAwake) => update({ keepAwake })} />} />
      </ListGroup>

      <View style={{ marginTop: SPACE.xl }}>
        <Button title="Reset to defaults" variant="gray" onPress={() => set({ gym: DEFAULT_GYM })} />
      </View>
    </Screen>
  );
}
