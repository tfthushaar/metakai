import { View } from 'react-native';

import { useSettings } from '../../core/store/settings';
import { SPACE } from '../../core/theme/typography';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { WidgetGallery } from '../../widgets/WidgetGallery';

export default function Widgets() {
  const appLock = useSettings((s) => s.appLock);
  return (
    <Screen title="Widgets" back>
      <Text variant="subhead" tone="secondary">
        Keep calories, readiness or your quick actions on your home screen. They follow your theme and update as you log.
      </Text>
      <View style={{ marginTop: SPACE.lg }}>
        <WidgetGallery />
      </View>
      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
        {appLock
          ? 'Widgets show their numbers on your home screen even with app lock on. Opening Metakai from one still asks you to unlock.'
          : 'Anyone who can see your home screen can see what a widget shows.'}
      </Text>
    </Screen>
  );
}
