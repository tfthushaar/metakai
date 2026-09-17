import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { dateKey, formatLong } from '../lib/dates';
import { displayWeight, weightUnit } from '../lib/units';
import { deletePhoto, listPhotos, photoAvailable, savePhoto, type Pose, type ProgressPhoto } from '../modules/body/repo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const POSES: { value: Pose; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
];

function Thumb({ photo, selected, size, onPress, onLongPress }: { photo: ProgressPhoto; selected: boolean; size: number; onPress: () => void; onLongPress: () => void }) {
  const { colors } = useTheme();
  const available = photoAvailable(photo);
  return (
    <PressableScale onPress={onPress} onLongPress={onLongPress} scaleTo={0.96} style={[styles.thumb, { width: size, height: size * (4 / 3), backgroundColor: colors.fill, borderColor: selected ? colors.accent : 'transparent' }]}>
      {available ? (
        <Image source={{ uri: photo.localPath! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.missing}>
          <Icon name="cloudOff" size={18} color={colors.textTertiary} />
          <Text variant="caption" tone="tertiary" align="center">
            On another device
          </Text>
        </View>
      )}
      <View style={[styles.poseTag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <Text variant="caption" color="#FFFFFF">
          {photo.pose}
        </Text>
      </View>
      {selected && (
        <View style={[styles.check, { backgroundColor: colors.accent }]}>
          <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />
        </View>
      )}
    </PressableScale>
  );
}

export default function Photos() {
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { latestRawKg, currentKg } = useBody();
  const photos = useQuery(['progress_photos'], listPhotos);
  const [pose, setPose] = useState<Pose>('front');
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [gridWidth, setGridWidth] = useState(0);
  const thumbSize = gridWidth > 0 ? (gridWidth - SPACE.sm * 2) / 3 : 0;

  const sessions = useMemo(() => {
    const map = new Map<string, ProgressPhoto[]>();
    for (const p of photos) {
      if (!map.has(p.dateKey)) map.set(p.dateKey, []);
      map.get(p.dateKey)!.push(p);
    }
    return [...map.entries()];
  }, [photos]);

  const lastOfPose = photos.find((p) => p.pose === pose && photoAvailable(p));

  const add = async (source: 'camera' | 'library') => {
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast(source === 'camera' ? 'Camera access is needed to take photos' : 'Photo access is needed to import');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [3, 4] };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      await savePhoto(result.assets[0].uri, dateKey(), pose, latestRawKg ?? currentKg);
      haptic.success();
      toast(`${POSES.find((p) => p.value === pose)!.label} photo saved`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save photo');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (photo: ProgressPhoto) => {
    haptic.selection();
    setSelected((s) => (s.includes(photo.id) ? s.filter((x) => x !== photo.id) : [...s.slice(-1), photo.id]));
  };

  const confirmDelete = (photo: ProgressPhoto) =>
    Alert.alert('Delete photo?', 'It will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePhoto(photo) },
    ]);

  return (
    <Screen title="Photos" back>
      <Card>
        <Text variant="footnote" tone="secondary" style={{ marginBottom: SPACE.sm }}>
          POSE
        </Text>
        <SegmentedControl<Pose> value={pose} onChange={setPose} segments={POSES} />
        {lastOfPose && (
          <View style={styles.ghostRow}>
            <Image source={{ uri: lastOfPose.localPath! }} style={styles.ghost} resizeMode="cover" />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {`Match your last ${pose} photo from ${formatLong(lastOfPose.dateKey)}: same spot, light and distance.`}
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Take photo" icon="plus" onPress={() => add('camera')} loading={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Import" variant="gray" onPress={() => add('library')} disabled={busy} />
          </View>
        </View>
        <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm }}>
          Photos are stored privately inside Metakai, not in your gallery.
        </Text>
      </Card>

      {photos.length > 1 && (
        <View style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
          {comparing ? (
            <View style={styles.compareBar}>
              <Text variant="subhead" tone="secondary" style={{ flex: 1 }}>
                {selected.length < 2 ? `Select ${2 - selected.length} more` : 'Ready to compare'}
              </Text>
              <Button title="Cancel" variant="plain" size="sm" full={false} onPress={() => { setComparing(false); setSelected([]); }} />
              <Button
                title="Compare"
                size="sm"
                full={false}
                disabled={selected.length < 2}
                onPress={() => {
                  const [a, b] = photos.filter((p) => selected.includes(p.id)).sort((x, y) => x.dateKey.localeCompare(y.dateKey));
                  router.push({ pathname: '/compare', params: { a: a.id, b: b.id } });
                }}
              />
            </View>
          ) : (
            <Button title="Compare two photos" variant="tinted" icon="grid" onPress={() => setComparing(true)} />
          )}
        </View>
      )}

      {sessions.map(([day, list], i) => {
        const weight = list.find((p) => p.weightKg != null)?.weightKg;
        return (
          <Animated.View key={day} entering={FadeIn.duration(250).delay(i * 40)} style={{ marginTop: SPACE.xl }}>
            <View style={styles.sessionHeader}>
              <Text variant="headline">{formatLong(day)}</Text>
              {weight != null && <Text variant="subhead" tone="secondary" tabular>{`${displayWeight(weight, units)} ${weightUnit(units)}`}</Text>}
            </View>
            <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {list.map((p) => (
                <Thumb
                  key={p.id}
                  photo={p}
                  selected={selected.includes(p.id)}
                  size={thumbSize}
                  onPress={() => (comparing ? toggleSelect(p) : photoAvailable(p) && router.push({ pathname: '/compare', params: { a: p.id } }))}
                  onLongPress={() => confirmDelete(p)}
                />
              ))}
            </View>
          </Animated.View>
        );
      })}

      {photos.length === 0 && (
        <Text variant="subhead" tone="tertiary" align="center" style={{ marginTop: SPACE.xxl }}>
          Take front, side and back photos every 2–4 weeks.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ghostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md },
  ghost: { width: 48, height: 64, borderRadius: RADIUS.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  compareBar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.sm, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  thumb: { borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 3 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  poseTag: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  check: { position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
