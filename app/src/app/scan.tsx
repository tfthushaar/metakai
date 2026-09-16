import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACE } from '../core/theme/typography';
import { useTheme } from '../core/theme/ThemeProvider';
import { lookupBarcode, useScanHandoff } from '../modules/food/barcode';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

const FRAME = 260;

export default function Scan() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const onFood = useScanHandoff((s) => s.onFood);
  const clear = useScanHandoff((s) => s.clear);
  const [status, setStatus] = useState<'scanning' | 'looking' | 'notFound' | 'error'>('scanning');
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const line = useSharedValue(0);

  useEffect(() => {
    line.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [line]);
  useEffect(() => () => clear(), [clear]);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.value * (FRAME * 0.6 - 4) }] }));

  const onScanned = async (result: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;
    haptic.success();
    setStatus('looking');
    try {
      const food = await lookupBarcode(result.data);
      if (!food) {
        setStatus('notFound');
        setMessage(`No nutrition data for ${result.data}. Try another angle, or use Quick add.`);
        return;
      }
      onFood?.(food);
      router.back();
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Lookup failed.');
    }
  };

  const retry = () => {
    busy.current = false;
    setStatus('scanning');
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Icon name="search" size={40} color={colors.textTertiary} />
        <Text variant="title2" align="center">
          Scan barcodes
        </Text>
        <Text variant="subhead" tone="secondary" align="center" style={{ maxWidth: 300 }}>
          Allow camera access to look up packaged foods by their barcode.
        </Text>
        <View style={{ width: 240, gap: SPACE.sm }}>
          <Button title="Allow camera" onPress={requestPermission} />
          <Button title="Not now" variant="plain" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={status === 'scanning' ? onScanned : undefined}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.xl }]} pointerEvents="box-none">
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={styles.close}>
            <Icon name="close" size={20} color="#FFFFFF" strokeWidth={2.6} />
          </PressableScale>
          <Text variant="headline" color="#FFFFFF">
            Scan barcode
          </Text>
          <View style={styles.close} />
        </View>

        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          {status === 'scanning' && <Animated.View style={[styles.line, { backgroundColor: colors.accent }, lineStyle]} />}
          {status === 'looking' && <ActivityIndicator color="#FFFFFF" size="large" />}
        </View>

        <View style={styles.bottom}>
          {status === 'scanning' && (
            <Text variant="subhead" color="rgba(255,255,255,0.85)" align="center">
              Line up the barcode inside the frame
            </Text>
          )}
          {(status === 'notFound' || status === 'error') && (
            <View style={{ gap: SPACE.md, alignItems: 'center' }}>
              <Text variant="subhead" color="#FFFFFF" align="center">
                {message}
              </Text>
              <Button title="Scan again" size="md" full={false} onPress={retry} />
            </View>
          )}
          <Text variant="caption" color="rgba(255,255,255,0.5)" align="center" style={{ marginTop: SPACE.md }}>
            Product data from Open Food Facts
          </Text>
        </View>
      </View>
    </View>
  );
}

const C = 28;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, padding: SPACE.xl },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  frame: { alignSelf: 'center', width: FRAME, height: FRAME * 0.6, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: C, height: C, borderColor: '#FFFFFF' },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  line: { position: 'absolute', top: 2, left: 12, right: 12, height: 2, borderRadius: 1 },
  bottom: { paddingHorizontal: SPACE.xl },
});
