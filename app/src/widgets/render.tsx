import type { WidgetInfo, WidgetRepresentation } from 'react-native-android-widget';

import type { Colors } from '../core/theme/palette';
import { useSettings } from '../core/store/settings';
import { caloriesData, quickActions, readinessData, waterToday, widgetTheme } from './data';
import { CaloriesWidget, QuickLogWidget, ReadinessWidget } from './Widgets';

/** Widget names, as declared for Android in app.json. */
export const WIDGET_NAMES = ['Calories', 'Readiness', 'QuickLog'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** Reads a widget's data once and returns a function that draws it in given colours. */
export function widgetDrawer(name: string, info: Pick<WidgetInfo, 'width' | 'height'>): ((colors: Colors) => React.JSX.Element) | null {
  let draw: ((colors: Colors) => React.JSX.Element) | null = null;
  if (name === 'Calories') {
    const data = caloriesData();
    draw = (colors) => <CaloriesWidget data={data} colors={colors} width={info.width} />;
  } else if (name === 'Readiness') {
    const data = readinessData();
    const uri = useSettings.getState().enabledModules.includes('recovery') ? 'metakai://recovery' : 'metakai://overview';
    draw = (colors) => <ReadinessWidget data={data} colors={colors} width={info.width} uri={uri} />;
  } else if (name === 'QuickLog') {
    const actions = quickActions();
    const water = actions.some((a) => a.id === 'water') ? waterToday() : 0;
    draw = (colors) => <QuickLogWidget actions={actions} colors={colors} width={info.width} water={water} />;
  }
  return draw;
}

/** Builds a widget with fresh data, in the app's light and dark colours. */
export function renderWidget(name: string, info: Pick<WidgetInfo, 'width' | 'height'>): WidgetRepresentation | null {
  const draw = widgetDrawer(name, info);
  if (!draw) return null;
  const theme = widgetTheme();
  return theme.dark ? { light: draw(theme.light), dark: draw(theme.dark) } : draw(theme.light);
}
