import { StyleSheet, View } from 'react-native';

import { reminderOffered, syncReminders } from '../../core/reminders';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { adjustRepeat, clock, DEFAULT_REMINDERS, describe, REMINDER_IDS, REMINDER_KIND, shiftClock, toggleDay, WEEKDAY_NAMES, type Reminder, type ReminderId } from '../../lib/reminders';
import { Card } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

const TITLES: Record<ReminderId, string> = {
  weighIn: 'Morning weigh-in',
  logFood: 'Log your food',
  water: 'Water',
  workout: 'Workouts',
  checkIn: 'Morning check-in',
  review: 'Weekly check-in',
  supplements: 'Supplements',
  habits: 'Habits',
  photos: 'Progress photos',
};

function Stepper({ onMinus, onPlus }: { onMinus: () => void; onPlus: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepper}>
      <PressableScale feedback="selection" onPress={onMinus} style={[styles.stepButton, { backgroundColor: colors.fill }]}>
        <Icon name="minus" size={16} color={colors.text} />
      </PressableScale>
      <PressableScale feedback="selection" onPress={onPlus} style={[styles.stepButton, { backgroundColor: colors.fill }]}>
        <Icon name="plus" size={16} color={colors.text} />
      </PressableScale>
    </View>
  );
}

function ValueRow({ label, value, onMinus, onPlus, first }: { label?: string; value: string; onMinus: () => void; onPlus: () => void; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.valueRow, first && styles.firstRow, first && { borderTopColor: colors.separator }]}>
      <View style={{ flex: 1 }}>
        {label ? (
          <Text variant="footnote" tone="secondary">
            {label}
          </Text>
        ) : null}
        <Text variant="title2" tabular>
          {value}
        </Text>
      </View>
      <Stepper onMinus={onMinus} onPlus={onPlus} />
    </View>
  );
}

function Days({ isOn, onPress }: { isOn: (day: number) => boolean; onPress: (day: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.days}>
      {WEEKDAY_NAMES.map((name, idx) => {
        const selected = isOn(idx + 1);
        return (
          <PressableScale
            key={name}
            feedback="selection"
            onPress={() => onPress(idx + 1)}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            style={[styles.day, { backgroundColor: selected ? colors.text : colors.fill }]}
          >
            <Text variant="caption" weight="semibold" color={selected ? colors.background : colors.text}>
              {name}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function Reminders() {
  const reminders = useSettings((s) => s.reminders);
  const enabledModules = useSettings((s) => s.enabledModules);
  const set = useSettings((s) => s.set);

  const current = (id: ReminderId): Reminder => ({ ...DEFAULT_REMINDERS[id], ...reminders[id] });

  const update = async (id: ReminderId, patch: Partial<Reminder>) => {
    const latest = useSettings.getState().reminders;
    set({ reminders: { ...latest, [id]: { ...DEFAULT_REMINDERS[id], ...latest[id], ...patch } } });
    const ok = await syncReminders();
    if (!ok) {
      toast('Allow notifications in system settings to get reminders');
      const after = useSettings.getState().reminders;
      set({ reminders: { ...after, [id]: { ...after[id], on: false } } });
    }
  };

  const shiftTime = (id: ReminderId, minutes: number) => {
    const r = current(id);
    haptic.selection();
    const time = shiftClock(r.hour, r.minute, minutes);
    update(id, REMINDER_KIND[id] === 'repeat' ? adjustRepeat({ ...r, ...time }, {}) : time);
  };

  return (
    <Screen title="Reminders" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
        Gentle nudges at times you choose, for the features you use. Tapping one opens the right screen.
      </Text>
      <View style={{ gap: SPACE.md }}>
        {REMINDER_IDS.filter((id) => reminderOffered(id, enabledModules)).map((id, i) => {
          const r = current(id);
          const kind = REMINDER_KIND[id];
          return (
            <Card key={id} index={i}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{TITLES[id]}</Text>
                  <Text variant="footnote" tone="secondary">
                    {describe(id, r)}
                  </Text>
                </View>
                <Toggle value={r.on} onChange={(on) => update(id, { on })} />
              </View>
              {r.on && <ValueRow first label={kind === 'repeat' ? 'Starts' : undefined} value={clock(r.hour, r.minute)} onMinus={() => shiftTime(id, -15)} onPlus={() => shiftTime(id, 15)} />}
              {r.on && kind === 'repeat' && (
                <>
                  <ValueRow
                    label="Every"
                    value={`${r.everyHours ?? 2} ${(r.everyHours ?? 2) === 1 ? 'hour' : 'hours'}`}
                    onMinus={() => update(id, adjustRepeat(r, { everyHours: (r.everyHours ?? 2) - 1 }))}
                    onPlus={() => update(id, adjustRepeat(r, { everyHours: (r.everyHours ?? 2) + 1 }))}
                  />
                  <ValueRow
                    label="Until"
                    value={clock(r.untilHour ?? 21)}
                    onMinus={() => update(id, adjustRepeat(r, { untilHour: (r.untilHour ?? 21) - 1 }))}
                    onPlus={() => update(id, adjustRepeat(r, { untilHour: (r.untilHour ?? 21) + 1 }))}
                  />
                </>
              )}
              {r.on && kind === 'weekly' && <Days isOn={(day) => r.weekday === day} onPress={(day) => update(id, { weekday: day })} />}
              {r.on && kind === 'days' && <Days isOn={(day) => (r.days ?? []).includes(day)} onPress={(day) => update(id, { days: toggleDay(r.days, day) })} />}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  firstRow: { paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: 'row', gap: SPACE.sm },
  stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.md },
  day: { width: 40, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
