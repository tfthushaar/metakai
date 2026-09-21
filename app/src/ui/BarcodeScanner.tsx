import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet } from 'react-native';

/**
 * The camera view that reads food barcodes. The standard build uses expo-camera; the free-software
 * build replaces this whole file with BarcodeScanner.foss.tsx, which uses CameraX and ZXing instead of ML Kit.
 */

export interface CameraPermission {
  granted: boolean;
}

/** Camera permission: null while it's being checked, and a function that asks for it. */
export function useCameraPermission(): [CameraPermission | null, () => void] {
  const [permission, request] = useCameraPermissions();
  return [permission, () => void request()];
}

/** Shows the back camera filling its parent and calls `onScanned` with each barcode read while `active`. */
export function BarcodeScanner({ active, onScanned }: { active: boolean; onScanned: (code: string) => void }) {
  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
      onBarcodeScanned={active ? (result) => onScanned(result.data) : undefined}
    />
  );
}
