import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { LAYOUTS, useHiddenTabs, useScreenAvailable, type LayoutScreen } from '../../core/store/layouts';
import { useSettings, type StartTab } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';

const SCREENS: LayoutScreen[] = ['today', 'train', 'progress', 'quick'];

export default function Customize() {
  const router = useRouter();
  const { colors } = useTheme();
  const startTab = useSettings((s) => s.startTab);
  const set = useSettings((s) => s.set);
  const hidden = useHiddenTabs();
  const trainAvailable = useScreenAvailable('train');
  const quickAvailable = useScreenAvailable('quick');
  const screens = SCREENS.filter((s) => (s === 'train' ? trainAvailable : s === 'quick' ? quickAvailable : true));

  const tabs = (
    [
      { value: 'index', label: 'Today' },
      { value: 'food', label: 'Food' },
      { value: 'train', label: 'Train' },
      { value: 'progress', label: 'Progress' },
    ] as { value: StartTab; label: string }[]
  ).filter((t) => !hidden.includes(t.value));

  return (
    <Screen title="Layout" back>
      <Text variant="subhead" tone="secondary">
        Choose what each screen shows and in what order. Features you turn off disappear everywhere.
      </Text>

      <ListGroup header="Features">
        <ListRow icon="grid" title="Features" subtitle="Turn whole features on or off" onPress={() => router.push('/settings/features')} />
      </ListGroup>

      <ListGroup header="Screens">
        {screens.map((s) => (
          <ListRow key={s} title={LAYOUTS[s].title} subtitle={LAYOUTS[s].description} onPress={() => router.push({ pathname: '/settings/layout', params: { screen: s } })} />
        ))}
      </ListGroup>

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.xl, marginBottom: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        OPEN THE APP ON
      </Text>
      <View style={{ paddingHorizontal: 2 }}>
        <SegmentedControl<StartTab> value={tabs.some((t) => t.value === startTab) ? startTab : 'index'} onChange={(v) => set({ startTab: v })} segments={tabs} />
      </View>
    </Screen>
  );
}
