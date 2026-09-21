import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import type { Colors } from '../core/theme/palette';
import type { CaloriesData, QuickAction, ReadinessData } from './data';
import { iconSvg } from './icons';

/** Home screen widgets, drawn with Android's widget views rather than React Native views. */

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

/** SVG wants plain colours: #RRGGBBAA becomes #RRGGBB plus an opacity. */
function svgPaint(c: string): { color: string; opacity: number } {
  if (/^#[0-9a-f]{8}$/i.test(c)) return { color: c.slice(0, 7), opacity: parseInt(c.slice(7), 16) / 255 };
  return { color: c, opacity: 1 };
}

function ringSvg(size: number, stroke: number, progress: number, color: string, track: string): string {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, progress)) * circumference;
  const t = svgPaint(track);
  const a = svgPaint(color);
  const arc =
    shown > 0
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${a.color}" stroke-opacity="${a.opacity}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${shown} ${circumference}" transform="rotate(-90 ${c} ${c})"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${t.color}" stroke-opacity="${t.opacity}" stroke-width="${stroke}"/>${arc}</svg>`;
}

const icon = (name: Parameters<typeof iconSvg>[0], color: string, size: number, strokeWidth = 2) => (
  <SvgWidget svg={iconSvg(name, svgPaint(color).color, strokeWidth)} style={{ width: size, height: size }} />
);

function Ring({ size, stroke, progress, color, colors, value, caption }: { size: number; stroke: number; progress: number; color: string; colors: Colors; value: string; caption?: string }) {
  return (
    <OverlapWidget style={{ width: size, height: size }}>
      <SvgWidget svg={ringSvg(size, stroke, progress, color, colors.fill)} style={{ width: size, height: size }} />
      <FlexWidget style={{ width: size, height: size, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <TextWidget text={value} style={{ fontSize: size > 90 ? 24 : 20, fontWeight: '700', color: hex(colors.text) }} maxLines={1} />
        {caption ? <TextWidget text={caption} style={{ fontSize: 11, color: hex(colors.textSecondary) }} maxLines={1} /> : null}
      </FlexWidget>
    </OverlapWidget>
  );
}

function Card({ colors, uri, children, label }: { colors: Colors; uri: string; children: React.ReactNode; label: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', backgroundColor: hex(colors.surface), borderRadius: 22, padding: 14 }}
    >
      {children}
    </FlexWidget>
  );
}

function Header({ title, colors, action }: { title: string; colors: Colors; action?: { uri: string; label: string } }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget text={title} style={{ fontSize: 13, fontWeight: '500', color: hex(colors.textSecondary) }} maxLines={1} />
      <FlexWidget style={{ flex: 1 }} />
      {action ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: action.uri }}
          accessibilityLabel={action.label}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: hex(colors.accentSoft), alignItems: 'center', justifyContent: 'center' }}
        >
          {icon('plus', colors.accent, 16, 2.5)}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

function MacroBar({ name, eaten, target, colors }: { name: string; eaten: number; target: number; colors: Colors }) {
  const share = target > 0 ? Math.min(1, eaten / target) : 0;
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginBottom: 6 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
        <TextWidget text={name} style={{ fontSize: 12, color: hex(colors.textSecondary) }} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={`${eaten} / ${target} g`} style={{ fontSize: 12, color: hex(colors.text) }} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', height: 4, borderRadius: 2, backgroundColor: hex(colors.fill), flexDirection: 'row', marginTop: 3 }}>
        {share > 0 ? <FlexWidget style={{ flex: share, height: 4, borderRadius: 2, backgroundColor: hex(colors.accent) }} /> : null}
        {share < 1 ? <FlexWidget style={{ flex: 1 - share, height: 4 }} /> : null}
      </FlexWidget>
    </FlexWidget>
  );
}

function Message({ colors, title, body }: { colors: Colors; title: string; body: string }) {
  return (
    <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column', justifyContent: 'center' }}>
      <TextWidget text={title} style={{ fontSize: 16, fontWeight: '700', color: hex(colors.text) }} maxLines={2} />
      <TextWidget text={body} style={{ fontSize: 13, color: hex(colors.textSecondary), marginTop: 4 }} maxLines={3} />
    </FlexWidget>
  );
}

/** Calories left today, with protein (and carbs and fat when there's room). */
export function CaloriesWidget({ data, colors, width }: { data: CaloriesData | null; colors: Colors; width: number }) {
  if (!data) {
    return (
      <Card colors={colors} uri="metakai://goal" label="Set a goal in Metakai">
        <Header title="Calories" colors={colors} />
        <Message colors={colors} title="No calorie target yet" body="Set a goal in Metakai to see what's left today." />
      </Card>
    );
  }
  const over = data.kcalLeft < 0;
  const wide = width >= 240;
  const ring = wide ? 104 : 92;
  const value = Math.abs(data.kcalLeft).toLocaleString('en-US');
  return (
    <Card colors={colors} uri="metakai://food" label={`${value} calories ${over ? 'over' : 'left'} today`}>
      <Header title="Calories" colors={colors} action={{ uri: 'metakai://log-food', label: 'Log food' }} />
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center' }}>
        <Ring
          size={ring}
          stroke={9}
          progress={data.kcalTarget > 0 ? data.eatenKcal / data.kcalTarget : 0}
          color={over ? colors.danger : colors.accent}
          colors={colors}
          value={value}
          caption={over ? 'kcal over' : 'kcal left'}
        />
        {wide ? (
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 14 }}>
            <MacroBar name="Protein" {...data.protein} colors={colors} />
            <MacroBar name="Carbs" {...data.carbs} colors={colors} />
            <MacroBar name="Fat" {...data.fat} colors={colors} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
      {wide ? null : (
        <TextWidget
          text={`Protein ${data.protein.eaten} / ${data.protein.target} g`}
          style={{ fontSize: 12, color: hex(colors.textSecondary), textAlign: 'center', width: 'match_parent' }}
          maxLines={1}
        />
      )}
    </Card>
  );
}

const hours = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** Today's readiness with last night's sleep and the main reason for the score. */
export function ReadinessWidget({ data, colors, width, uri }: { data: ReadinessData | null; colors: Colors; width: number; uri: string }) {
  if (!data) {
    return (
      <Card colors={colors} uri="metakai://recovery" label="Check in to see your readiness">
        <Header title="Readiness" colors={colors} />
        <Message colors={colors} title="How do you feel today?" body="Check in, or connect a watch, to see how ready you are to train." />
      </Card>
    );
  }
  const color = data.band === 'high' ? colors.success : data.band === 'moderate' ? colors.warning : colors.danger;
  const wide = width >= 240;
  const details = [data.sleepHours != null ? `${hours(data.sleepHours)} sleep` : null, data.note].filter((x): x is string => !!x);
  return (
    <Card colors={colors} uri={uri} label={`Readiness ${data.score}, ${data.label}`}>
      <Header title="Readiness" colors={colors} />
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Ring size={wide ? 96 : 76} stroke={8} progress={data.score / 100} color={color} colors={colors} value={String(data.score)} />
        <FlexWidget style={{ flexDirection: 'column', marginLeft: wide ? 14 : 0, marginTop: wide ? 0 : 6, alignItems: wide ? 'flex-start' : 'center', flex: wide ? 1 : undefined }}>
          <TextWidget text={data.label} style={{ fontSize: 15, fontWeight: '700', color: hex(color) }} maxLines={1} />
          {(wide ? details : details.slice(0, 1)).map((d) => (
            <TextWidget key={d} text={d} style={{ fontSize: 12, color: hex(colors.textSecondary), marginTop: 2 }} maxLines={2} />
          ))}
        </FlexWidget>
      </FlexWidget>
    </Card>
  );
}

/** A row of the user's own quick actions from the + menu. */
export function QuickLogWidget({ actions, colors, width, water }: { actions: QuickAction[]; colors: Colors; width: number; water: number }) {
  const fits = Math.max(1, Math.min(6, Math.floor((width - 16) / 68)));
  const shown = actions.slice(0, fits);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center', backgroundColor: hex(colors.surface), borderRadius: 22, paddingHorizontal: 8 }}
    >
      {shown.length === 0 ? (
        <TextWidget text="Choose quick actions in Metakai → You → Layout" style={{ fontSize: 13, color: hex(colors.textSecondary), marginLeft: 8 }} />
      ) : (
        shown.map((a) => {
          const label = a.id === 'water' && water > 0 ? `${Math.round(water / 50) / 20} L` : a.label;
          return (
            <FlexWidget
              key={a.id}
              clickAction={a.uri ? 'OPEN_URI' : a.id.toUpperCase()}
              clickActionData={a.uri ? { uri: a.uri } : undefined}
              accessibilityLabel={a.id === 'water' ? 'Add a glass of water' : a.label}
              style={{ flex: 1, height: 'match_parent', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            >
              <FlexWidget style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: hex(colors.accentSoft), alignItems: 'center', justifyContent: 'center' }}>
                {icon(a.icon, colors.accent, 20)}
              </FlexWidget>
              <TextWidget text={label} style={{ fontSize: 11, color: hex(colors.text), marginTop: 5 }} maxLines={1} />
            </FlexWidget>
          );
        })
      )}
    </FlexWidget>
  );
}
