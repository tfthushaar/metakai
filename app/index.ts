import 'expo-router/entry';

import { registerWidgets } from './src/widgets/register';

// Android draws home screen widgets from JavaScript, even when the app isn't open.
registerWidgets();
