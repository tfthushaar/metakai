import { View } from 'react-native';

import { dependents, GROUP_ORDER, isAvailable, MODULES, PRESETS, type ModuleId, type PresetId } from '../../core/features/registry';
import { useSettings } from '../../core/store/settings';
import { SPACE } from '../../core/theme/typography';
import { Chip } from '../../ui/Chip';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

const PRESET_ORDER: PresetId[] = ['cut', 'lean_bulk', 'recomp', 'maintain', 'minimal', 'everything'];

export default function FeatureSettings() {
  const enabled = useSettings((s) => s.enabledModules);
  const preset = useSettings((s) => s.preset);
  const toggle = useSettings((s) => s.toggleModule);
  const applyPreset = useSettings((s) => s.applyPreset);

  const onToggle = (id: ModuleId, on: boolean) => {
    const affected = on ? [] : dependents(id, enabled).filter(isAvailable);
    toggle(id, on);
    if (affected.length) toast(`Also hid ${affected.map((m) => MODULES[m].name).join(', ')}`);
  };

  const available = (Object.keys(MODULES) as ModuleId[]).filter(isAvailable);

  return (
    <Screen title="Features" back>
      <Text variant="subhead" tone="secondary">
        Show only what you use. Turning a feature off hides it everywhere; your data is kept.
      </Text>

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.xl, marginBottom: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        PRESETS
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        {PRESET_ORDER.map((id) => (
          <Chip key={id} label={PRESETS[id].name} selected={preset === id} onPress={() => applyPreset(id)} />
        ))}
      </View>

      {GROUP_ORDER.map((group) => {
        const modules = available.filter((id) => MODULES[id].group === group);
        if (modules.length === 0) return null;
        return (
          <ListGroup key={group} header={group}>
            {modules.map((id) => {
              const m = MODULES[id];
              const needs = m.requires.filter((r) => !enabled.includes(r)).map((r) => MODULES[r].name);
              return (
                <ListRow
                  key={id}
                  title={m.name}
                  subtitle={needs.length ? `${m.description} Turns on ${needs.join(', ')}.` : m.description}
                  accessory={<Toggle value={enabled.includes(id)} onChange={(on) => onToggle(id, on)} />}
                />
              );
            })}
          </ListGroup>
        );
      })}

      <Text variant="footnote" tone="tertiary" style={{ marginTop: SPACE.xl, paddingHorizontal: SPACE.lg }}>
        Rearrange what each screen shows in You → Layout.
      </Text>
    </Screen>
  );
}
