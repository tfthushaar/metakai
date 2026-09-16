import { StyleSheet, View } from 'react-native';

import { syncReminders } from '../../core/reminders';
import { DEFAULT_REMINDERS, useSettings, type Reminder, type ReminderId } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { Card } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

const META: Record<ReminderId, { title: string; detail: string }> = {
  weighIn: { title: 'Morning weigh-in', detail: 'Daily' },
  logFood: { title: 'Log your food', detail: 'Daily' },
  photos: { title: 'Progress photos', detail: 'Weekly' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
const format = (r: Reminder) => {
  const h12 = ((r.hour + 11) % 12) + 1;
  return `${h12}:${pad(r.minute)} ${r.hour < 12 ? 'AM' : 'PM'}`;
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

export default function Reminders() {
  const { colors } = useTheme();
  const reminders = useSettings((s) => s.reminders);
  const set = useSettings((s) => s.set);

  const update = async (id: ReminderId, patch: Partial<Reminder>) => {
    set({ reminders: { ...reminders, [id]: { ...(reminders[id] ?? DEFAULT_REMINDERS[id]), ...patch } } });
    const ok = await syncReminders();
    if (!ok) {
      toast('Allow notifications in system settings to get reminders');
      set({ reminders: { ...useSettings.getState().reminders, [id]: { ...useSettings.getState().reminders[id], on: false } } });
    }
  };

  const shiftTime = (id: ReminderId, minutes: number) => {
    const r = reminders[id];
    const total = (r.hour * 60 + r.minute + minutes + 24 * 60) % (24 * 60);
    haptic.selection();
    update(id, { hour: Math.floor(total / 60), minute: total % 60 });
  };

  return (
    <Screen title="Reminders" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
        Gentle nudges at times you choose. Tapping one opens the right screen.
      </Text>
      <View style={{ gap: SPACE.md }}>
        {(Object.keys(META) as ReminderId[]).map((id, i) => {
          const r = reminders[id] ?? DEFAULT_REMINDERS[id];
          return (
            <Card key={id} index={i}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{META[id].title}</Text>
                  <Text variant="footnote" tone="secondary">
                    {META[id].detail}
                  </Text>
                </View>
                <Toggle value={r.on} onChange={(on) => update(id, { on })} />
              </View>
              {r.on && (
                <View style={[styles.timeRow, { borderTopColor: colors.separator }]}>
                  <Text variant="title2" tabular style={{ flex: 1 }}>
                    {format(r)}
                  </Text>
                  <Stepper onMinus={() => shiftTime(id, -15)} onPlus={() => shiftTime(id, 15)} />
                </View>
              )}
              {r.on && r.weekday != null && (
                <View style={styles.days}>
                  {WEEKDAYS.map((d, idx) => {
                    const selected = r.weekday === idx + 1;
                    return (
                      <PressableScale
                        key={d}
                        feedback="selection"
                        onPress={() => update(id, { weekday: idx + 1 })}
                        style={[styles.day, { backgroundColor: selected ? colors.text : colors.fill }]}
                      >
                        <Text variant="caption" weight="semibold" color={selected ? colors.background : colors.text}>
                          {d}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: 'row', gap: SPACE.sm },
  stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.md },
  day: { width: 40, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
