import { requireNativeView } from 'expo';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { CameraPermission } from './BarcodeScanner';

/**
 * The barcode camera in the free-software build: CameraX and ZXing through the metakai-scanner
 * module, with no ML Kit. Replaces BarcodeScanner.tsx.
 */

export type { CameraPermission } from './BarcodeScanner';

const NativeScanner = requireNativeView<{
  style?: StyleProp<ViewStyle>;
  active: boolean;
  onScan: (event: { nativeEvent: { data: string; type: string } }) => void;
}>('MetakaiScanner');

const CAMERA = PermissionsAndroid.PERMISSIONS.CAMERA;

/** Camera permission: null while it's being checked, and a function that asks for it. */
export function useCameraPermission(): [CameraPermission | null, () => void] {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    PermissionsAndroid.check(CAMERA)
      .then(setGranted)
      .catch(() => setGranted(false));
  }, []);
  const request = () => {
    PermissionsAndroid.request(CAMERA)
      .then((result) => setGranted(result === PermissionsAndroid.RESULTS.GRANTED))
      .catch(() => setGranted(false));
  };
  return [granted === null ? null : { granted }, request];
}

/** Shows the back camera filling its parent and calls `onScanned` with each barcode read while `active`. */
export function BarcodeScanner({ active, onScanned }: { active: boolean; onScanned: (code: string) => void }) {
  return <NativeScanner style={StyleSheet.absoluteFill} active={active} onScan={(event) => onScanned(event.nativeEvent.data)} />;
}
