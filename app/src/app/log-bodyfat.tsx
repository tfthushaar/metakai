import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { bodyFatBand, JP3_SITES, jp3BodyFat, navyBodyFat } from '../lib/bodycomp';
import { dateKey } from '../lib/dates';
import { ageFromBirthDate } from '../lib/energy';
import { CM_PER_IN } from '../lib/units';
import { addBodyComp, latestMeasurements, saveMeasurements, type BodyFatMethod } from '../modules/body/repo';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

type Mode = 'navy' | 'jp3' | 'manual';

const num = (t: string) => {
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};

export default function LogBodyFat() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { profile } = useBody();
  const latest = useQuery(['measurements'], latestMeasurements);
  const [mode, setMode] = useState<Mode>('navy');
  const [manualMethod, setManualMethod] = useState<BodyFatMethod>('scale');
  const inch = units !== 'metric';
  const fromUnit = (v: number | null) => (v == null ? null : inch ? v * CM_PER_IN : v);
  const pre = (cm?: number) => (cm ? (inch ? cm / CM_PER_IN : cm).toFixed(1) : '');

  const [neck, setNeck] = useState(pre(latest.neck?.cm));
  const [waist, setWaist] = useState(pre(latest.waist?.cm));
  const [hips, setHips] = useState(pre(latest.hips?.cm));
  const [folds, setFolds] = useState(['', '', '']);
  const [manual, setManual] = useState('');

  if (!profile) return null;
  const sex = profile.sex;
  const age = ageFromBirthDate(profile.birthDate);
  const lenUnit = inch ? 'in' : 'cm';

  let result: number | null = null;
  if (mode === 'navy') {
    const n = fromUnit(num(neck));
    const w = fromUnit(num(waist));
    const h = fromUnit(num(hips));
    if (n && w && (sex === 'male' || h)) result = navyBodyFat(sex, profile.heightCm, n, w, h);
  } else if (mode === 'jp3') {
    const values = folds.map(num);
    if (values.every((v) => v != null)) result = jp3BodyFat(sex, age, values.reduce((s, v) => s + v!, 0));
  } else {
    result = num(manual);
  }
  const valid = result != null && result >= 2 && result <= 70;

  const save = () => {
    if (!valid) return;
    const today = dateKey();
    if (mode === 'navy') {
      addBodyComp(today, 'navy', result!, { neck: fromUnit(num(neck))!, waist: fromUnit(num(waist))!, ...(sex === 'female' ? { hips: fromUnit(num(hips))! } : {}) });
      saveMeasurements(today, { neck: fromUnit(num(neck))!, waist: fromUnit(num(waist))!, ...(sex === 'female' ? { hips: fromUnit(num(hips))! } : {}) });
    } else if (mode === 'jp3') {
      addBodyComp(today, 'jp3', result!, Object.fromEntries(JP3_SITES[sex].map((s, i) => [s, num(folds[i])!])));
    } else {
      addBodyComp(today, manualMethod, result!);
    }
    haptic.success();
    toast(`Body fat ${result!.toFixed(1)}% saved`);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + 40, gap: SPACE.lg }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Body fat</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>

        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          segments={[
            { value: 'navy', label: 'Tape' },
            { value: 'jp3', label: 'Calipers' },
            { value: 'manual', label: 'Enter %' },
          ]}
        />

        <View style={{ alignItems: 'center', minHeight: 96, justifyContent: 'center' }}>
          {valid ? (
            <>
              <AnimatedNumber value={result!} decimals={1} variant="display" suffix="%" style={{ textAlign: 'center', minWidth: 200 }} />
              <Text variant="subhead" tone="secondary">
                {bodyFatBand(sex, result!)}
              </Text>
            </>
          ) : (
            <Text variant="subhead" tone="tertiary" align="center">
              {mode === 'manual' ? 'Enter the reading from your scale or scan' : 'Fill in the measurements to see your estimate'}
            </Text>
          )}
        </View>

        {mode === 'navy' && (
          <View style={{ gap: SPACE.md }}>
            <TextField label="Neck, below the larynx" value={neck} onChangeText={setNeck} keyboardType="decimal-pad" suffix={lenUnit} />
            <TextField label="Waist, at the navel" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" suffix={lenUnit} />
            {sex === 'female' && <TextField label="Hips, widest point" value={hips} onChangeText={setHips} keyboardType="decimal-pad" suffix={lenUnit} />}
            <Text variant="footnote" tone="tertiary">
              Uses your height from your profile. Typically within ±3–4% of a DEXA scan.
            </Text>
          </View>
        )}

        {mode === 'jp3' && (
          <View style={{ gap: SPACE.md }}>
            {JP3_SITES[sex].map((site, i) => (
              <TextField
                key={site}
                label={`${site[0].toUpperCase()}${site.slice(1)} skinfold`}
                value={folds[i]}
                onChangeText={(t) => setFolds((f) => f.map((x, j) => (j === i ? t : x)))}
                keyboardType="decimal-pad"
                suffix="mm"
              />
            ))}
            <Text variant="footnote" tone="tertiary">
              Jackson-Pollock 3-site. Take each fold on the right side, twice, and use the average.
            </Text>
          </View>
        )}

        {mode === 'manual' && (
          <View style={{ gap: SPACE.md }}>
            <SegmentedControl<BodyFatMethod>
              value={manualMethod}
              onChange={setManualMethod}
              segments={[
                { value: 'scale', label: 'Smart scale' },
                { value: 'dexa', label: 'DEXA' },
                { value: 'visual', label: 'Estimate' },
              ]}
            />
            <TextField label="Body fat" value={manual} onChangeText={setManual} keyboardType="decimal-pad" suffix="%" />
          </View>
        )}

        <Button title="Save" onPress={save} disabled={!valid} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
