import { useWindowDimensions, View } from 'react-native';
import { requestPinWidget, WidgetPreview } from 'react-native-android-widget';

import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';
import { widgetDrawer, type WidgetName } from './render';

const WIDGETS: { name: WidgetName; title: string; body: string; cells: [number, number] }[] = [
  { name: 'Calories', title: 'Calories left', body: 'What’s left today, with protein. Widen it for carbs and fat.', cells: [2, 2] },
  { name: 'Readiness', title: 'Readiness', body: 'Today’s score, last night’s sleep and what’s behind it.', cells: [2, 2] },
  { name: 'QuickLog', title: 'Quick log', body: 'Your quick actions from the + menu, one tap from your home screen.', cells: [4, 1] },
];

/** Previews of each home screen widget with a button to add it. */
export function WidgetGallery() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const full = Math.min(width, 520) - SPACE.lg * 4;

  const add = async (name: WidgetName) => {
    const asked = await requestPinWidget({ widgetName: name }).catch(() => false);
    if (!asked) toast('Long-press your home screen, choose Widgets and find Metakai.');
  };

  return (
    <View style={{ gap: SPACE.md }}>
      {WIDGETS.map((w, i) => {
        const size = w.cells[1] === 1 ? { width: full, height: 76 } : { width: Math.min(full, 190), height: 170 };
        const draw = widgetDrawer(w.name, size);
        return (
          <Card key={w.name} index={i} style={{ gap: SPACE.md }}>
            <View style={{ gap: 2 }}>
              <Text variant="headline">{w.title}</Text>
              <Text variant="footnote" tone="secondary">
                {w.body}
              </Text>
            </View>
            {draw && (
              <View style={{ alignItems: 'center', backgroundColor: colors.fill, borderRadius: 20, padding: SPACE.md }}>
                <WidgetPreview renderWidget={() => draw(colors)} width={size.width} height={size.height} />
              </View>
            )}
            <Button title="Add to home screen" icon="plus" size="md" variant="tinted" onPress={() => add(w.name)} />
          </Card>
        );
      })}
    </View>
  );
}
