import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { Icon, type IconName } from './Icon';
import { enterUp } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function ListGroup({ header, footer, children, index }: { header?: string; footer?: string; children: ReactNode; index?: number }) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  const body = (
    <View style={styles.group}>
      {header && (
        <Text variant="footnote" tone="secondary" style={styles.header}>
          {header.toUpperCase()}
        </Text>
      )}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
            {child}
          </Fragment>
        ))}
      </View>
      {footer && (
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          {footer}
        </Text>
      )}
    </View>
  );
  return index == null ? body : <Animated.View entering={enterUp(index)}>{body}</Animated.View>;
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  accessory?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  selected?: boolean;
}

export function ListRow({ title, subtitle, value, icon, iconColor, onPress, accessory, chevron = !!onPress, destructive, selected }: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconBadge, { backgroundColor: iconColor ?? colors.accent }]}>
          <Icon name={icon} size={17} color={iconColor === colors.fill ? colors.text : contrastOn(iconColor ?? colors.accent)} strokeWidth={2.2} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text variant="body" tone={destructive ? 'danger' : 'primary'}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="footnote" tone="secondary" style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {value != null && (
        <Text variant="body" tone="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      )}
      {accessory}
      {selected && <Icon name="check" size={20} color={colors.accent} strokeWidth={2.6} />}
      {chevron && <Icon name="chevronRight" size={18} color={colors.textTertiary} strokeWidth={2.4} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} feedback="selection">
      {content}
    </PressableScale>
  );
}

/** Black or white, whichever reads better on the given hex colour. */
function contrastOn(hex: string): string {
  const h = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

const styles = StyleSheet.create({
  group: { marginTop: SPACE.xl },
  header: { paddingHorizontal: SPACE.lg, marginBottom: 6, letterSpacing: 0.3 },
  footer: { paddingHorizontal: SPACE.lg, marginTop: 6 },
  card: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.lg },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: 10, gap: 12 },
  iconBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  value: { maxWidth: '50%' },
});
