import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addWeight, saveProfile, startPhase } from '../core/db/repo';
import { MODULES, PRESETS, isAvailable, type ModuleId, type PresetId } from '../core/features/registry';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey, formatLong } from '../lib/dates';
import { ACTIVITY_LABEL, type ActivityLevel, type Sex } from '../lib/energy';
import { CORE_GOALS, GOALS, recommendGoal, type Experience, type GoalType } from '../lib/goals';
import { predict } from '../lib/prediction';
import { computeTargets } from '../lib/targets';
import { cmToFtIn, kgToLb, lbToKg, type UnitSystem } from '../lib/units';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { ProgressBar } from '../ui/ProgressBar';
import { Ring } from '../ui/Ring';
import { RulerPicker } from '../ui/RulerPicker';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';
import { WeightChart } from '../ui/WeightChart';

type StepId = 'sex' | 'age' | 'height' | 'weight' | 'activity' | 'experience' | 'bodyfat' | 'goal' | 'target' | 'features' | 'summary';

const RATE_OPTIONS: Partial<Record<GoalType, { label: string; rate: number }[]>> = {
  cut: [
    { label: 'Gentle', rate: 0.5 },
    { label: 'Steady', rate: 0.75 },
    { label: 'Fast', rate: 1.0 },
  ],
  lean_bulk: [
    { label: 'Slow', rate: 0.15 },
    { label: 'Steady', rate: 0.25 },
    { label: 'Faster', rate: 0.4 },
  ],
  bulk: [
    { label: 'Steady', rate: 0.35 },
    { label: 'Faster', rate: 0.5 },
    { label: 'Fast', rate: 0.75 },
  ],
};

const PRESET_FOR_GOAL: Record<GoalType, PresetId> = {
  cut: 'cut',
  mini_cut: 'cut',
  event_prep: 'cut',
  lean_bulk: 'lean_bulk',
  bulk: 'lean_bulk',
  recomp: 'recomp',
  maintain: 'maintain',
  reverse: 'maintain',
  diet_break: 'maintain',
  strength: 'maintain',
};

function OptionCard({ title, detail, selected, onPress, badge }: { title: string; detail?: string; selected: boolean; onPress: () => void; badge?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      feedback="selection"
      scaleTo={0.98}
      style={[
        styles.option,
        { backgroundColor: colors.surface, borderColor: selected ? colors.accent : 'transparent' },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="headline">{title}</Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Text variant="caption" tone="accent" weight="semibold">
                {badge}
              </Text>
            </View>
          )}
        </View>
        {detail && (
          <Text variant="subhead" tone="secondary">
            {detail}
          </Text>
        )}
      </View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.textTertiary, backgroundColor: selected ? colors.accent : 'transparent' }]}>
        {selected && <Icon name="check" size={14} color={colors.onAccent} strokeWidth={3} />}
      </View>
    </PressableScale>
  );
}

function BigValue({ value, unit, decimals = 0 }: { value: number; unit: string; decimals?: number }) {
  return (
    <View style={styles.bigValue}>
      <AnimatedNumber value={value} decimals={decimals} variant="display" style={{ minWidth: 60, textAlign: 'center' }} />
      <Text variant="title3" tone="secondary" style={{ marginBottom: 8 }}>
        {unit}
      </Text>
    </View>
  );
}

export default function Onboarding() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [width, setWidth] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [units, setUnits] = useState<UnitSystem>(settings.units);
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(24);
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(80);
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [experience, setExperience] = useState<Experience>('beginner');
  const [knowsBodyFat, setKnowsBodyFat] = useState(false);
  const [bodyFat, setBodyFat] = useState(20);
  const [goal, setGoal] = useState<GoalType>('cut');
  const [targetKg, setTargetKg] = useState(72);
  const [rate, setRate] = useState(0.75);
  const [modules, setModules] = useState<ModuleId[]>(PRESETS.cut.modules);

  const def = GOALS[goal];
  const steps = useMemo<StepId[]>(
    () => ['sex', 'age', 'height', 'weight', 'activity', 'experience', 'bodyfat', 'goal', ...(def.direction !== 0 ? (['target'] as StepId[]) : []), 'features', 'summary'],
    [def.direction],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const bf = knowsBodyFat ? bodyFat : null;
  const recommendation = recommendGoal({ sex, bodyFatPct: bf, experience });
  const body = { sex, weightKg, heightCm, age, activity, bodyFatPct: bf };

  const go = (delta: 1 | -1) => {
    setDirection(delta);
    setStepIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta)));
  };

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (stepIndex === 0) return false;
        go(-1);
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex]),
  );

  const chooseGoal = (g: GoalType) => {
    setGoal(g);
    const d = GOALS[g];
    const options = RATE_OPTIONS[g];
    if (options) setRate(options[1].rate);
    if (d.direction < 0) setTargetKg(Math.round(weightKg * 0.9));
    if (d.direction > 0) setTargetKg(Math.round(weightKg * 1.06));
    setModules(PRESETS[PRESET_FOR_GOAL[g]].modules);
  };

  const effectiveRate = def.direction === 0 ? 0 : rate;
  const targets = computeTargets({ ...body, goal, ratePctWeek: effectiveRate });
  const prediction = useMemo(
    () =>
      step === 'summary' || step === 'target'
        ? predict({ ...body, goal, startDate: dateKey(), targetKg: def.direction !== 0 ? targetKg : null, intakeKcal: targets.kcal, maxWeeks: 104 })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, goal, targetKg, targets.kcal, weightKg, heightCm, age, activity, bf, sex],
  );

  const finish = () => {
    const today = dateKey();
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - age);
    saveProfile({ name: null, sex, birthDate: dateKey(birth), heightCm, activity, experience, bodyFatPct: bf, dietaryPrefs: [] });
    startPhase({
      goalType: goal,
      startDate: today,
      startKg: weightKg,
      targetKg: def.direction !== 0 ? targetKg : null,
      ratePctWeek: effectiveRate,
      overrides: {},
    });
    addWeight(today, weightKg);
    settings.set({ units, enabledModules: modules, preset: PRESET_FOR_GOAL[goal], onboarded: true });
  };

  const wUnit = units === 'metric' ? 'kg' : 'lb';
  const toDisplay = (kg: number) => (units === 'metric' ? kg : kgToLb(kg));
  const fromDisplay = (v: number) => (units === 'metric' ? v : lbToKg(v));

  const weightRuler = (valueKg: number, onChange: (kg: number) => void) => (
    <RulerPicker
      key={`w-${units}`}
      width={width}
      min={units === 'metric' ? 30 : 66}
      max={units === 'metric' ? 250 : 550}
      step={units === 'metric' ? 0.1 : 0.2}
      majorEvery={units === 'metric' ? 10 : 25}
      value={Math.round(toDisplay(valueKg) * 10) / 10}
      onChange={(v) => onChange(fromDisplay(v))}
    />
  );

  const titles: Record<StepId, [string, string]> = {
    sex: ['About you', 'Used to estimate your energy needs.'],
    age: ['How old are you?', 'Metabolism changes with age.'],
    height: ['How tall are you?', ''],
    weight: ['Current weight', 'Weigh in the morning for the most consistent number.'],
    activity: ['How active are you?', 'Outside of planned training, count your average day.'],
    experience: ['Training experience', 'This shapes how fast you can expect to build muscle.'],
    bodyfat: ['Body fat', 'Optional. It makes calorie and protein targets more precise.'],
    goal: ['Your goal', recommendation.reason],
    target: [def.direction < 0 ? 'Target weight' : 'Target weight', 'Pick a pace you can keep for months.'],
    features: ['Choose what you see', 'Turn features on or off anytime in Settings.'],
    summary: ['Your plan', 'Targets adapt as your weight changes.'],
  };

  const renderStep = () => {
    switch (step) {
      case 'sex':
        return (
          <View style={{ gap: SPACE.md }}>
            <OptionCard title="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
            <OptionCard title="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
            <View style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
              <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 4 }}>
                UNITS
              </Text>
              <SegmentedControl<UnitSystem>
                value={units}
                onChange={setUnits}
                segments={[
                  { value: 'metric', label: 'Metric (kg, cm)' },
                  { value: 'imperial', label: 'Imperial (lb, in)' },
                ]}
              />
            </View>
          </View>
        );
      case 'age':
        return (
          <View>
            <BigValue value={age} unit="years" />
            <RulerPicker width={width} min={13} max={90} step={1} majorEvery={5} value={age} onChange={setAge} />
            {age < 18 && (
              <Text variant="footnote" tone="warning" align="center" style={{ marginTop: SPACE.md }}>
                Under 18, Metakai keeps deficits and surpluses gentle.
              </Text>
            )}
          </View>
        );
      case 'height': {
        const { ft, inches } = cmToFtIn(heightCm);
        return (
          <View>
            {units === 'metric' ? <BigValue value={heightCm} unit="cm" /> : (
              <View style={styles.bigValue}>
                <Text variant="display">{`${ft}′ ${inches}″`}</Text>
              </View>
            )}
            <RulerPicker
              key={`h-${units}`}
              width={width}
              min={units === 'metric' ? 120 : 48}
              max={units === 'metric' ? 220 : 87}
              step={1}
              majorEvery={units === 'metric' ? 10 : 12}
              value={units === 'metric' ? heightCm : Math.round(heightCm / 2.54)}
              format={units === 'metric' ? undefined : (v) => `${Math.floor(v / 12)}′`}
              onChange={(v) => setHeightCm(units === 'metric' ? v : Math.round(v * 2.54))}
            />
          </View>
        );
      }
      case 'weight':
        return (
          <View>
            <BigValue value={toDisplay(weightKg)} unit={wUnit} decimals={1} />
            {weightRuler(weightKg, setWeightKg)}
          </View>
        );
      case 'activity':
        return (
          <View style={{ gap: SPACE.md }}>
            {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
              <OptionCard key={a} title={ACTIVITY_LABEL[a].title} detail={ACTIVITY_LABEL[a].detail} selected={activity === a} onPress={() => setActivity(a)} />
            ))}
          </View>
        );
      case 'experience':
        return (
          <View style={{ gap: SPACE.md }}>
            <OptionCard title="Beginner" detail="Under 1 year of consistent lifting" selected={experience === 'beginner'} onPress={() => setExperience('beginner')} />
            <OptionCard title="Intermediate" detail="1–3 years, steady progress" selected={experience === 'intermediate'} onPress={() => setExperience('intermediate')} />
            <OptionCard title="Advanced" detail="3+ years, progress is slow" selected={experience === 'advanced'} onPress={() => setExperience('advanced')} />
          </View>
        );
      case 'bodyfat':
        return (
          <View>
            <View style={[styles.rowCard, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">I know my body fat</Text>
                <Text variant="footnote" tone="secondary">
                  From a scan, calipers or a smart scale
                </Text>
              </View>
              <Toggle value={knowsBodyFat} onChange={setKnowsBodyFat} />
            </View>
            {knowsBodyFat && (
              <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ marginTop: SPACE.xl }}>
                <BigValue value={bodyFat} unit="%" decimals={0} />
                <RulerPicker width={width} min={3} max={60} step={1} majorEvery={5} value={bodyFat} onChange={setBodyFat} />
              </Animated.View>
            )}
          </View>
        );
      case 'goal':
        return (
          <View style={{ gap: SPACE.md }}>
            {CORE_GOALS.map((g) => (
              <OptionCard
                key={g.type}
                title={g.title}
                detail={g.tagline}
                badge={recommendation.goal === g.type ? 'Recommended' : undefined}
                selected={goal === g.type}
                onPress={() => chooseGoal(g.type)}
              />
            ))}
          </View>
        );
      case 'target': {
        const options = RATE_OPTIONS[goal] ?? [];
        const weeklyKg = (weightKg * rate) / 100;
        const invalid = def.direction < 0 ? targetKg >= weightKg : targetKg <= weightKg;
        return (
          <View>
            <BigValue value={toDisplay(targetKg)} unit={wUnit} decimals={1} />
            {weightRuler(targetKg, setTargetKg)}
            <View style={{ marginTop: SPACE.xxl, gap: SPACE.md }}>
              <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 4 }}>
                PACE
              </Text>
              <SegmentedControl
                value={String(rate)}
                onChange={(v) => setRate(Number(v))}
                segments={options.map((o) => ({ value: String(o.rate), label: o.label }))}
              />
              <View style={[styles.rowCard, { backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="headline" tabular>
                    {`${def.direction < 0 ? '−' : '+'}${toDisplay(weeklyKg).toFixed(2)} ${wUnit} / week`}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {invalid
                      ? `Pick a target ${def.direction < 0 ? 'below' : 'above'} your current weight`
                      : prediction?.etaDate
                        ? `Expected around ${formatLong(prediction.etaDate)}`
                        : 'Further than two years at this pace'}
                  </Text>
                </View>
                <Text variant="title3" tabular>{`${targets.kcal}`}</Text>
                <Text variant="footnote" tone="secondary">
                  kcal
                </Text>
              </View>
              {targets.warnings.map((w) => (
                <Text key={w} variant="footnote" tone="warning">
                  {w}
                </Text>
              ))}
            </View>
          </View>
        );
      }
      case 'features':
        return (
          <View style={{ gap: SPACE.md }}>
            {(Object.keys(MODULES) as ModuleId[]).filter(isAvailable).map((id) => (
              <View key={id} style={[styles.rowCard, { backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{MODULES[id].name}</Text>
                  <Text variant="footnote" tone="secondary">
                    {MODULES[id].description}
                  </Text>
                </View>
                <Toggle
                  value={modules.includes(id)}
                  onChange={(on) => setModules((m) => (on ? [...m, id] : m.filter((x) => x !== id)))}
                />
              </View>
            ))}
            <Text variant="footnote" tone="tertiary" style={{ paddingHorizontal: 4 }}>
              Workouts, photos, measurements and more arrive in upcoming updates and will follow the same switches.
            </Text>
          </View>
        );
      case 'summary': {
        const today = dateKey();
        const end = prediction?.points[prediction.points.length - 1]?.date ?? addDays(today, 90);
        return (
          <View style={{ gap: SPACE.lg }}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
              <Ring size={132} stroke={13} progress={1}>
                <AnimatedNumber value={targets.kcal} variant="title1" />
                <Text variant="caption" tone="secondary">
                  kcal / day
                </Text>
              </Ring>
              <View style={{ flex: 1, gap: SPACE.md }}>
                {[
                  ['Protein', targets.protein],
                  ['Carbs', targets.carbs],
                  ['Fat', targets.fat],
                ].map(([label, g]) => (
                  <View key={label as string}>
                    <Text variant="footnote" tone="secondary">
                      {label}
                    </Text>
                    <Text variant="title3" tabular>{`${g} g`}</Text>
                  </View>
                ))}
              </View>
            </View>
            {prediction && (
              <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
                <Text variant="headline">
                  {def.direction === 0 ? 'Hold within your range' : prediction.etaDate ? `Goal by ${formatLong(prediction.etaDate)}` : 'Your predicted curve'}
                </Text>
                <Text variant="footnote" tone="secondary" style={{ marginBottom: SPACE.md }}>
                  {`Estimated maintenance ${targets.tdee} kcal`}
                </Text>
                <WeightChart
                  trend={[{ date: today, kg: weightKg, trend: weightKg }]}
                  prediction={prediction.points}
                  goalKg={def.direction !== 0 ? targetKg : null}
                  startDate={today}
                  endDate={end}
                  units={units}
                  height={180}
                />
              </View>
            )}
            {targets.warnings.map((w) => (
              <Text key={w} variant="footnote" tone="warning">
                {w}
              </Text>
            ))}
          </View>
        );
      }
    }
  };

  const invalidTarget = step === 'target' && (def.direction < 0 ? targetKg >= weightKg : targetKg <= weightKg);
  const [title, subtitle] = titles[step];
  const entering = (direction === 1 ? SlideInRight : SlideInLeft).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1));

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <PressableScale
          onPress={() => go(-1)}
          disabled={stepIndex === 0}
          hitSlop={12}
          feedback="selection"
          style={[styles.backButton, { opacity: stepIndex === 0 ? 0 : 1 }]}
        >
          <Icon name="chevronLeft" size={26} color={colors.text} strokeWidth={2.4} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={(stepIndex + 1) / steps.length} height={4} color={colors.text} />
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SPACE.xl, paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - SPACE.xl * 2)}
      >
        <Animated.View key={step} entering={entering}>
          <Text variant="largeTitle" style={{ marginTop: SPACE.xl }}>
            {title}
          </Text>
          {subtitle !== '' && (
            <Text variant="callout" tone="secondary" style={{ marginTop: SPACE.sm, marginBottom: SPACE.xxl }}>
              {subtitle}
            </Text>
          )}
          {subtitle === '' && <View style={{ height: SPACE.xxl }} />}
          {renderStep()}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.lg, backgroundColor: colors.background }]}>
        <Button
          title={step === 'summary' ? 'Start my plan' : 'Continue'}
          onPress={step === 'summary' ? finish : () => go(1)}
          disabled={invalidTarget}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 52 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    gap: SPACE.md,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  bigValue: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginBottom: SPACE.xl, height: 64 },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: SPACE.lg, borderRadius: RADIUS.lg, gap: SPACE.md },
  summaryCard: { flexDirection: 'row', alignItems: 'center', padding: SPACE.xl, borderRadius: RADIUS.xl, gap: SPACE.xl },
  chartCard: { padding: SPACE.lg, borderRadius: RADIUS.xl },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.xl, paddingTop: SPACE.md },
});
