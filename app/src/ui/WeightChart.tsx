import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../core/theme/ThemeProvider';
import { FONT } from '../core/theme/typography';
import { dateKey, daysBetween, formatShort } from '../lib/dates';
import type { PredictionPoint } from '../lib/prediction';
import type { TrendPoint } from '../lib/trend';
import { kgToLb, type UnitSystem } from '../lib/units';
import { EASE_OUT } from './motion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface WeightChartProps {
  trend: TrendPoint[];
  prediction?: PredictionPoint[];
  goalKg?: number | null;
  startDate: string;
  endDate: string;
  units: UnitSystem;
  height?: number;
  /** Sparkline mode: no axes or labels. */
  compact?: boolean;
}

const FULL_PAD = { top: 12, right: 40, bottom: 24, left: 4 };
const COMPACT_PAD = { top: 8, right: 8, bottom: 8, left: 4 };

export function WeightChart({ trend, prediction = [], goalKg, startDate, endDate, units, height = 220, compact }: WeightChartProps) {
  const PAD = compact ? COMPACT_PAD : FULL_PAD;
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const reveal = useSharedValue(0);
  const conv = (kg: number) => (units === 'metric' ? kg : kgToLb(kg));

  const model = useMemo(() => {
    if (width === 0) return null;
    const visibleTrend = trend.filter((p) => p.date >= startDate && p.date <= endDate);
    const visiblePred = prediction.filter((p) => p.date >= startDate && p.date <= endDate);
    const values: number[] = [];
    visibleTrend.forEach((p) => {
      values.push(p.trend);
      if (p.kg != null) values.push(p.kg);
    });
    visiblePred.forEach((p) => values.push(p.low, p.high));
    if (goalKg != null && values.length) {
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (goalKg >= lo - (hi - lo) * 0.6 && goalKg <= hi + (hi - lo) * 0.6) values.push(goalKg);
    }
    if (values.length === 0) return null;
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < 2) {
      const mid = (max + min) / 2;
      min = mid - 1;
      max = mid + 1;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;

    const totalDays = Math.max(1, daysBetween(startDate, endDate));
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const x = (d: string) => PAD.left + (daysBetween(startDate, d) / totalDays) * innerW;
    const y = (kg: number) => PAD.top + (1 - (kg - min) / (max - min)) * innerH;

    const line = (pts: { date: string; v: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

    const trendPath = line(visibleTrend.map((p) => ({ date: p.date, v: p.trend })));
    const expectedPath = line(visiblePred.map((p) => ({ date: p.date, v: p.expected })));
    const bandPath = visiblePred.length
      ? `${line(visiblePred.map((p) => ({ date: p.date, v: p.high })))} ${[...visiblePred]
          .reverse()
          .map((p) => `L${x(p.date).toFixed(1)},${y(p.low).toFixed(1)}`)
          .join(' ')} Z`
      : '';

    const ticks = [0, 0.5, 1].map((t) => min + pad + (max - min - 2 * pad) * t);
    const today = dateKey();
    return {
      x,
      y,
      trendPath,
      expectedPath,
      bandPath,
      dots: visibleTrend.filter((p) => p.kg != null),
      ticks,
      todayX: today >= startDate && today <= endDate ? x(today) : null,
      goalY: goalKg != null && goalKg >= min && goalKg <= max ? y(goalKg) : null,
      lastTrend: visibleTrend[visibleTrend.length - 1],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, trend, prediction, goalKg, startDate, endDate, compact]);

  useEffect(() => {
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: 1000, easing: EASE_OUT });
  }, [model?.trendPath, reveal]);

  const clipProps = useAnimatedProps(() => ({ width: Math.max(0, reveal.value * width) }));

  const labelStyle = { fontFamily: FONT.medium, fontSize: 11 };

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {model && (
        <Svg width={width} height={height}>
          <Defs>
            <ClipPath id="reveal">
              <AnimatedRect x={0} y={0} height={height} animatedProps={clipProps} />
            </ClipPath>
          </Defs>

          {!compact && model.ticks.map((t, i) => (
            <G key={i}>
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={model.y(t)}
                y2={model.y(t)}
                stroke={colors.separator}
                strokeWidth={StyleSheet.hairlineWidth}
              />
              <SvgText x={width - PAD.right + 6} y={model.y(t) + 4} fill={colors.textTertiary} {...labelStyle}>
                {conv(t).toFixed(1)}
              </SvgText>
            </G>
          ))}

          {model.goalY != null && (
            <G>
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={model.goalY}
                y2={model.goalY}
                stroke={colors.success}
                strokeWidth={1.2}
                strokeDasharray="4 4"
              />
              {!compact && (
                <SvgText x={PAD.left + 4} y={model.goalY - 5} fill={colors.success} {...labelStyle}>
                  Goal
                </SvgText>
              )}
            </G>
          )}

          {model.todayX != null && (
            <Line
              x1={model.todayX}
              x2={model.todayX}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke={colors.textTertiary}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

          <G clipPath="url(#reveal)">
            {model.bandPath !== '' && <Path d={model.bandPath} fill={colors.accentSoft} />}
            {model.expectedPath !== '' && (
              <Path d={model.expectedPath} stroke={colors.accent} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 5" fill="none" />
            )}
            {model.dots.map((p) => (
              <Circle key={p.date} cx={model.x(p.date)} cy={model.y(p.kg!)} r={2.6} fill={colors.textTertiary} />
            ))}
            {model.trendPath !== '' && (
              <Path d={model.trendPath} stroke={colors.text} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            )}
          </G>

          {model.lastTrend && (
            <Circle
              cx={model.x(model.lastTrend.date)}
              cy={model.y(model.lastTrend.trend)}
              r={5}
              fill={colors.accent}
              stroke={colors.surface}
              strokeWidth={2.5}
            />
          )}

          {!compact && (
            <G>
              <SvgText x={PAD.left} y={height - 6} fill={colors.textTertiary} {...labelStyle}>
                {formatShort(startDate)}
              </SvgText>
              <SvgText x={width - PAD.right} y={height - 6} fill={colors.textTertiary} textAnchor="end" {...labelStyle}>
                {formatShort(endDate)}
              </SvgText>
            </G>
          )}
        </Svg>
      )}
    </View>
  );
}
