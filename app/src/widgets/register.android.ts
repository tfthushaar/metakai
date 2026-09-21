import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import { addGlassOfWater } from './data';
import { renderWidget } from './render';

/** Android asks for a widget when it's added, resized, due for its half-hourly refresh or tapped. */
const handler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget: show }) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  // Actions that work without opening the app.
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'WATER') addGlassOfWater();
  const widget = renderWidget(widgetInfo.widgetName, widgetInfo);
  if (widget) show(widget);
};

export function registerWidgets() {
  registerWidgetTaskHandler(handler);
}
