import { useRouter } from 'expo-router';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useBody } from '../../core/goals/useBody';
import { useMilestones } from '../../core/goals/useMilestones';
import { listBodyComp, listPhotos } from '../../modules/body/repo';
import { ListGroup, ListRow } from '../../ui/List';
import { NumberPrompt } from '../../ui/NumberPrompt';
import { dailyTotals, deleteWeight, listWeights, restoreWeight, updateWeight, type WeightEntry } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { useLayout } from '../../core/store/layouts';
import { RanksSection } from '../../modules/ranks/RanksSummary';
import { useFeature, useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { addDays, dateKey, formatLong, formatShort, parseDateKey } from '../../lib/dates';
import { GOALS } from '../../lib/goals';
import { displayWeight, lbToKg, weightUnit } from '../../lib/units';
import { Button } from '../../ui/Button';
import { Card, SectionHeader } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { EASE_OUT } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { WeightChart } from '../../ui/WeightChart';

type Range = '1m' | '3m' | '6m' | 'all';
const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '1m': 30, '3m': 90, '6m': 180 };

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="secondary" weight="medium">
        {label}
      </Text>
      <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {detail && (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {detail}
        </Text>
      )}
    </View>
  );
}

function IntakeBar({ ratio, over, index }: { ratio: number; over: boolean; index: number }) {
  const { colors } = useTheme();
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(index * 30, withTiming(Math.min(ratio, 1.3), { duration: 600, easing: EASE_OUT }));
  }, [ratio, index, h]);
  const style = useAnimatedStyle(() => ({ height: `${(h.value / 1.3) * 100}%` }));
  return (
    <View style={styles.barSlot}>
      <Animated.View style={[styles.bar, { backgroundColor: over ? colors.accent : colors.text, opacity: ratio === 0 ? 0 : 1 }, style]} />
    </View>
  );
}

function WeightRow({ entry, units }: { entry: WeightEntry; units: 'metric' | 'imperial' }) {
  const { colors } = useTheme();
  const [typing, setTyping] = useState(false);
  const remove = () => {
    haptic.medium();
    deleteWeight(entry.id);
    toast('Weigh-in removed', { label: 'Undo', onPress: () => restoreWeight(entry.id) });
  };
  const time = new Date(entry.measuredAt);
  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={60}
      overshootRight={false}
      renderRightActions={() => (
        <PressableScale onPress={remove} style={[styles.deleteAction, { backgroundColor: colors.danger }]}>
          <Icon name="trash" size={20} color="#FFFFFF" />
        </PressableScale>
      )}
    >
      <PressableScale scaleTo={0.995} feedback="selection" onPress={() => setTyping(true)} style={[styles.weightRow, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body">{formatLong(entry.dateKey)}</Text>
          <Text variant="footnote" tone="secondary">
            {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        <Text variant="headline" tabular>{`${displayWeight(entry.kg, units)} ${weightUnit(units)}`}</Text>
        <Icon name="pencil" size={15} color={colors.textTertiary} />
      </PressableScale>
      <NumberPrompt
        visible={typing}
        title="Weigh-in"
        unit={weightUnit(units)}
        value={Number(displayWeight(entry.kg, units))}
        decimals={1}
        min={units === 'metric' ? 20 : 44}
        max={units === 'metric' ? 400 : 880}
        hint={formatLong(entry.dateKey)}
        onClose={() => setTyping(false)}
        onSubmit={(v) => {
          updateWeight(entry.id, units === 'metric' ? v : lbToKg(v));
          toast('Weigh-in updated');
        }}
      />
    </ReanimatedSwipeable>
  );
}

export default function Progress() {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const predictionsOn = useFeature('predictions');
  const foodOn = useFeature('food');
  const milestonesOn = useFeature('milestones');
  const measurementsOn = useFeature('measurements');
  const bodyCompOn = useFeature('body_comp');
  const bodyOn = measurementsOn || bodyCompOn;
  const photosOn = useFeature('photos');
  const recoveryOn = useFeature('recovery');
  const healthOn = useFeature('health');
  const milestones = useMilestones();
  const nextMilestone = milestones?.find((m) => !m.reachedDate);
  const bodyComp = useQuery(['body_comp_entries'], listBodyComp);
  const latestBf = bodyComp[bodyComp.length - 1];
  const photoCount = useQuery(['progress_photos'], () => listPhotos().length);
  const [range, setRange] = useState<Range>('3m');
  const body = useBody();
  const weights = useQuery(['weight_entries'], listWeights);
  const today = dateKey();
  const intakeStart = addDays(today, -13);
  const intake = useQuery(['log_entries'], () => dailyTotals(intakeStart), [intakeStart]);

  const { trend, phase, prediction, currentKg, weeklyChange, etaDate, targets, progress } = body;
  const wu = weightUnit(units);
  const def = phase ? GOALS[phase.goalType] : null;

  const { startDate, endDate } = useMemo(() => {
    const first = trend[0]?.date ?? phase?.startDate ?? today;
    const start = range === 'all' ? first : addDays(today, -RANGE_DAYS[range]);
    const forecastDays = range === '1m' ? 21 : range === '3m' ? 45 : range === '6m' ? 90 : 3650;
    let end = today;
    if (predictionsOn && prediction && prediction.points.length) {
      const lastPred = prediction.points[prediction.points.length - 1].date;
      const cap = addDays(today, forecastDays);
      end = lastPred < cap ? lastPred : cap;
      if (end < today) end = today;
    }
    return { startDate: start < first ? first : start, endDate: end };
  }, [range, trend, phase, prediction, predictionsOn, today]);

  const days = Array.from({ length: 14 }, (_, i) => addDays(intakeStart, i));
  const intakeByDay = new Map(intake.map((d) => [d.dateKey, d.kcal]));
  const logged = intake.filter((d) => d.dateKey < today);
  const avgIntake = logged.length ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length : null;

  const totalChange = currentKg != null && phase ? currentKg - phase.startKg : null;
  const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${displayWeight(Math.abs(v), units, digits)}`;

  const sections = useLayout('progress');
  const blocks: Record<string, ReactNode> = {
    chart: (
      <>
        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          segments={[
            { value: '1m', label: '1M' },
            { value: '3m', label: '3M' },
            { value: '6m', label: '6M' },
            { value: 'all', label: 'All' },
          ]}
        />

        <Card index={0} style={{ marginTop: SPACE.md }}>
          {trend.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACE.xxl, gap: SPACE.md }}>
              <Icon name="scale" size={32} color={colors.textTertiary} />
              <Text variant="headline">No weigh-ins yet</Text>
              <Button title="Log weight" size="md" full={false} onPress={() => router.push('/log-weight')} />
            </View>
          ) : (
            <>
              <WeightChart
                key={range}
                trend={trend}
                prediction={predictionsOn ? prediction?.points : []}
                goalKg={predictionsOn ? phase?.targetKg : null}
                startDate={startDate}
                endDate={endDate}
                units={units}
                height={230}
              />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: colors.text }]} />
                  <Text variant="caption" tone="secondary">
                    Trend
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.textTertiary }]} />
                  <Text variant="caption" tone="secondary">
                    Weigh-ins
                  </Text>
                </View>
                {predictionsOn && def && def.direction !== 0 && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBand, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} />
                    <Text variant="caption" tone="secondary">
                      Predicted
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Card>
      </>
    ),
    stats:
      currentKg != null ? (
        <Card style={{ marginTop: SPACE.md }}>
          <View style={styles.statRow}>
            <Stat label="Weekly rate" value={weeklyChange == null ? '—' : `${signed(weeklyChange, 2)} ${wu}`} />
            <Stat label="Change" value={totalChange == null ? '—' : `${signed(totalChange)} ${wu}`} detail={phase ? `since ${formatShort(phase.startDate)}` : undefined} />
            {predictionsOn && phase?.targetKg != null && def?.direction !== 0 ? (
              <Stat
                label="Goal"
                value={progress != null && progress >= 1 ? 'Reached' : etaDate ? formatShort(etaDate) : '—'}
                detail={`${displayWeight(Math.abs(phase.targetKg - currentKg), units)} ${wu} to go`}
              />
            ) : (
              <Stat label="Maintenance" value={targets ? `${targets.tdee}` : '—'} detail="kcal / day" />
            )}
          </View>
        </Card>
      ) : null,
    ranks: <RanksSection />,
    body:
      phase || milestonesOn || bodyOn || photosOn ? (
        <ListGroup header="Body & progress" index={2}>
          {phase && (
            <ListRow
              icon="check"
              title="Weekly check-in"
              subtitle="How this week went and what to adjust"
              onPress={() => router.push('/checkin')}
            />
          )}
          {milestonesOn && phase && (
            <ListRow
              icon="trophy"
              title="Milestones"
              subtitle={
                nextMilestone
                  ? `Next ${displayWeight(nextMilestone.targetKg, units)} ${wu}${nextMilestone.predictedDate ? ` · ${formatShort(nextMilestone.predictedDate)}` : ''}`
                  : milestones && milestones.length
                    ? 'All milestones reached'
                    : 'Checkpoints for your plan'
              }
              onPress={() => router.push('/milestones')}
            />
          )}
          {bodyOn && (
            <ListRow
              icon="ruler"
              title="Body"
              subtitle={latestBf ? `Body fat ${latestBf.bfPct.toFixed(1)}%` : 'Measurements, body fat and FFMI'}
              onPress={() => router.push('/body')}
            />
          )}
          {photosOn && (
            <ListRow
              icon="user"
              title="Photos"
              subtitle={photoCount ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : 'Private progress photos'}
              onPress={() => router.push('/photos')}
            />
          )}
        </ListGroup>
      ) : null,
    health:
      recoveryOn || healthOn ? (
        <ListGroup header="Health & recovery" index={3}>
          {recoveryOn && (
            <ListRow icon="heartPulse" title="Recovery" subtitle="Readiness, sleep and muscle recovery" onPress={() => router.push('/recovery')} />
          )}
          {healthOn && (
            <ListRow
              icon="pill"
              title="Health"
              subtitle="Supplements, blood pressure, heart rate and labs"
              onPress={() => router.push('/health')}
            />
          )}
        </ListGroup>
      ) : null,
    calories:
      foodOn && targets ? (
        <>
          <SectionHeader title="Calories" />
          <Card index={2}>
            <View style={styles.intakeHeader}>
              <View>
                <Text variant="footnote" tone="secondary">
                  Daily average
                </Text>
                <Text variant="title2" tabular>
                  {avgIntake == null ? '—' : `${Math.round(avgIntake).toLocaleString('en-US')} kcal`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="footnote" tone="secondary">
                  Target
                </Text>
                <Text variant="title2" tabular>
                  {targets.kcal.toLocaleString('en-US')}
                </Text>
              </View>
            </View>
            <View style={styles.bars}>
              <View style={[styles.targetLine, { bottom: `${(1 / 1.3) * 100}%`, borderColor: colors.textTertiary }]} />
              {days.map((d, i) => {
                const kcal = intakeByDay.get(d) ?? 0;
                return <IntakeBar key={d} ratio={kcal / targets.kcal} over={kcal > targets.kcal * 1.05} index={i} />;
              })}
            </View>
            <View style={styles.barLabels}>
              <Text variant="caption" tone="tertiary">
                {formatShort(days[0])}
              </Text>
              <Text variant="caption" tone="tertiary">
                {parseDateKey(today).toLocaleDateString([], { weekday: 'short' })}
              </Text>
            </View>
          </Card>
        </>
      ) : null,
    weighins:
      weights.length > 0 ? (
        <>
          <SectionHeader
            title="Weigh-ins"
            action={<Button title="Add" size="sm" variant="plain" full={false} onPress={() => router.push('/log-weight')} />}
          />
          <Card index={3} padded={false}>
            {[...weights]
              .reverse()
              .slice(0, 20)
              .map((w, i) => (
                <View key={w.id}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
                  <WeightRow entry={w} units={units} />
                </View>
              ))}
          </Card>
        </>
      ) : null,
  };

  return (
    <Screen title="Progress" tabBar>
      {sections
        .filter((id) => blocks[id])
        .map((id) => (
          <Fragment key={id}>{blocks[id]}</Fragment>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendBand: { width: 14, height: 8, borderRadius: 2, borderWidth: 1 },
  statRow: { flexDirection: 'row', gap: SPACE.md },
  stat: { flex: 1, gap: 2 },
  intakeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.lg },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 5 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 2 },
  targetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.lg },
  weightRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  deleteAction: { width: 80, alignItems: 'center', justifyContent: 'center' },
});
