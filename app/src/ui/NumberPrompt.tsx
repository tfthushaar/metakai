import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

export interface NumberPromptProps {
  visible: boolean;
  title: string;
  /** Shown next to the field, e.g. kg or kcal. */
  unit?: string;
  value: number;
  decimals?: number;
  min?: number;
  max?: number;
  hint?: string;
  onClose: () => void;
  onSubmit: (value: number) => void;
}

/** Types an exact number, for people who don't want to drag a ruler. */
export function NumberPrompt({ visible, title, unit, value, decimals = 0, min, max, hint, onClose, onSubmit }: NumberPromptProps) {
  const { colors } = useTheme();
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText(decimals > 0 ? String(Number(value.toFixed(decimals))) : String(Math.round(value)));
  }, [visible, value, decimals]);

  const parsed = Number(text.replace(',', '.'));
  const valid = text.trim().length > 0 && Number.isFinite(parsed) && (min == null || parsed >= min) && (max == null || parsed <= max);

  const submit = () => {
    if (!valid) return;
    Keyboard.dismiss();
    onSubmit(Number(parsed.toFixed(decimals)));
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]} onPress={() => {}}>
          <Text variant="headline">{title}</Text>
          <TextField
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            suffix={unit}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{ fontSize: 28, fontWeight: '600' }}
          />
          {hint && (
            <Text variant="caption" tone="tertiary">
              {hint}
            </Text>
          )}
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="gray" size="md" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Set" size="md" onPress={submit} disabled={!valid} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  sheet: { width: '100%', maxWidth: 380, borderRadius: RADIUS.xl, padding: SPACE.lg, gap: SPACE.md },
  actions: { flexDirection: 'row', gap: SPACE.sm },
});
