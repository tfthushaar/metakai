import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { bodyFatBand, composition, ffmiLabel, waistToHeight } from '../lib/bodycomp';
import { formatShort, relativeDay } from '../lib/dates';
import { CM_PER_IN, displayWeight, weightUnit } from '../lib/units';
import { deleteBodyComp, listBodyComp, listMeasurements, MEASUREMENT_SITES, METHOD_LABEL, type MeasurementSite } from '../modules/body/repo';
import { MiniLineChart } from '../modules/workouts/components';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

export default function Body() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const { profile, currentKg, trend } = useBody();
  const measurements = useQuery(['measurements'], () => listMeasurements());
  const bodyComp = useQuery(['body_comp_entries'], listBodyComp);
  const [site, setSite] = useState<MeasurementSite>('waist');

  const len = (cm: number) => (units === 'metric' ? `${cm.toFixed(1)} cm` : `${(cm / CM_PER_IN).toFixed(1)} in`);

  const bySite = useMemo(() => {
    const map = new Map<MeasurementSite, { dateKey: string; cm: number }[]>();
    for (const m of measurements) {
      if (!map.has(m.site)) map.set(m.site, []);
      map.get(m.site)!.push({ dateKey: m.dateKey, cm: m.cm });
    }
    return map;
  }, [measurements]);

  const latestBf = bodyComp[bodyComp.length - 1];
  const firstBf = bodyComp[0];
  const comp = latestBf && currentKg && profile ? composition(currentKg, profile.heightCm, latestBf.bfPct) : null;
  const weightOn = (d: string) => trend.find((t) => t.date >= d)?.trend ?? currentKg ?? 0;
  const firstComp = firstBf && firstBf !== latestBf && profile ? composition(weightOn(firstBf.dateKey), profile.heightCm, firstBf.bfPct) : null;
  const waist = bySite.get('waist');
  const series = bySite.get(site) ?? [];

  return (
    <Screen title="Body" back>
      <Card index={0}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="footnote" tone="secondary">
              Body fat
            </Text>
            <Text variant="largeTitle" tabular>
              {latestBf ? `${latestBf.bfPct.toFixed(1)}%` : '—'}
            </Text>
            <Text variant="footnote" tone="secondary">
              {latestBf && profile ? `${bodyFatBand(profile.sex, latestBf.bfPct)} · ${METHOD_LABEL[latestBf.method]}` : 'Add a measurement to track composition'}
            </Text>
          </View>
          <Button title="Add" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push('/log-bodyfat')} />
        </View>

        {comp && profile && (
          <View style={[styles.compGrid, { borderTopColor: colors.separator }]}>
            <View style={styles.compCell}>
              <Text variant="caption" tone="secondary">
                Lean mass
              </Text>
              <Text variant="headline" tabular>{`${displayWeight(comp.leanKg, units)} ${weightUnit(units)}`}</Text>
            </View>
            <View style={styles.compCell}>
              <Text variant="caption" tone="secondary">
                Fat mass
              </Text>
              <Text variant="headline" tabular>{`${displayWeight(comp.fatKg, units)} ${weightUnit(units)}`}</Text>
            </View>
            <View style={styles.compCell}>
              <Text variant="caption" tone="secondary">
                FFMI
              </Text>
              <Text variant="headline" tabular>
                {comp.normalizedFfmi.toFixed(1)}
              </Text>
            </View>
          </View>
        )}
        {comp && profile && (
          <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm }}>
            {`${ffmiLabel(comp.normalizedFfmi, profile.sex)} muscularity for your height.${firstComp ? ` Lean mass ${comp.leanKg >= firstComp.leanKg ? 'up' : 'down'} ${displayWeight(Math.abs(comp.leanKg - firstComp.leanKg), units)} ${weightUnit(units)} since ${formatShort(firstBf.dateKey)}.` : ''}`}
          </Text>
        )}
      </Card>

      {waist && waist.length > 0 && profile && (
        <Card index={1} style={{ marginTop: SPACE.md }}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="secondary">
                Waist-to-height
              </Text>
              <Text variant="title2" tabular>
                {waistToHeight(waist[waist.length - 1].cm, profile.heightCm).toFixed(2)}
              </Text>
            </View>
            <Text variant="footnote" tone="secondary" style={{ flex: 1, textAlign: 'right' }}>
              {waistToHeight(waist[waist.length - 1].cm, profile.heightCm) < 0.5 ? 'Below 0.5 is a healthy range' : 'Aim for under 0.5'}
            </Text>
          </View>
        </Card>
      )}

      <SectionHeader title="Measurements" action={<Button title="Log" size="sm" variant="plain" full={false} onPress={() => router.push('/log-measurements')} />} />
      {measurements.length === 0 ? (
        <Card index={2}>
          <Text variant="headline">Measure every 2–4 weeks</Text>
          <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
            The tape often shows progress when the scale stalls, especially on a recomp.
          </Text>
        </Card>
      ) : (
        <>
          <View style={styles.chips}>
            {MEASUREMENT_SITES.filter((s) => bySite.has(s.id)).map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                selected={site === s.id}
                onPress={() => {
                  haptic.selection();
                  setSite(s.id);
                }}
              />
            ))}
          </View>
          <Card index={2}>
            {series.length > 0 ? (
              <>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="footnote" tone="secondary">
                      {MEASUREMENT_SITES.find((s) => s.id === site)!.label}
                    </Text>
                    <Text variant="title1" tabular>
                      {len(series[series.length - 1].cm)}
                    </Text>
                  </View>
                  {series.length > 1 && (
                    <Text variant="headline" tabular tone={series[series.length - 1].cm <= series[0].cm ? 'success' : 'primary'}>
                      {`${series[series.length - 1].cm - series[0].cm > 0 ? '+' : '−'}${len(Math.abs(series[series.length - 1].cm - series[0].cm))}`}
                    </Text>
                  )}
                </View>
                {series.length > 1 && <MiniLineChart values={series.map((p) => p.cm)} height={100} />}
                <Text variant="caption" tone="tertiary">
                  {`${series.length} ${series.length === 1 ? 'entry' : 'entries'} · last ${relativeDay(series[series.length - 1].dateKey)}`}
                </Text>
              </>
            ) : (
              <Text tone="secondary">Pick a measurement.</Text>
            )}
          </Card>
        </>
      )}

      {bodyComp.length > 0 && (
        <>
          <SectionHeader title="Body fat history" />
          <Card padded={false}>
            {[...bodyComp].reverse().map((e, i) => (
              <PressableScale
                key={e.id}
                scaleTo={0.99}
                onLongPress={() => {
                  haptic.medium();
                  deleteBodyComp(e.id);
                }}
                style={[styles.historyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body">{relativeDay(e.dateKey)}</Text>
                  <Text variant="footnote" tone="secondary">
                    {METHOD_LABEL[e.method]}
                  </Text>
                </View>
                <Text variant="headline" tabular>{`${e.bfPct.toFixed(1)}%`}</Text>
              </PressableScale>
            ))}
          </Card>
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.sm }}>
            Compare readings from the same method; methods differ by several percent.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  compGrid: { flexDirection: 'row', marginTop: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  compCell: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.md },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.sm },
});
