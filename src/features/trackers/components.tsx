import { Redirect } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { DayStepper as FoodDayStepper } from '@/features/food/components';
import { spokenUnits } from '@/lib/spokenUnits';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { cup, fonts, useLargeText, useTextGrowth, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Button, CupKey, DECORATIVE, PressableScale, Text } from '@/ui';

/** Renders children only once a profile exists; otherwise sends the user to the welcome flow. */
export function RequireProfile({ children }: { children: React.ReactNode }) {
  const profile = useStore((s) => s.profile);
  if (!profile) return <Redirect href="/welcome" />;
  return <>{children}</>;
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * The day of a weigh-in or a night: the app's one date control (`DayStepper`, `@/features/food/components`), the
 * same look and words as food detail and the run log, stopping at today (a weight or a night is logged once it
 * happened). testIDs `<testID>-prev`, `-today`, `-label`, `-next`.
 */
export function DayStepper({ date, onChange, testID }: { date: ISODate; onChange: (d: ISODate) => void; testID: string }) {
  const todayDate = useToday();
  return <FoodDayStepper value={date} onChange={onChange} testIDPrefix={testID} latest={todayDate} />;
}

/**
 * Static figures read as one element, their units in full (WCAG 3.1.4): "6 h 51 min" over "Average a night" is
 * heard as "6 hours 51 minutes, Average a night". Natively the group is one text element; on the web, where a
 * name on a plain box is not read, it is a named image, as a chart is (its drawn words are then not read twice).
 */
export function spokenFigure(label: string): { accessible: true; accessibilityRole: 'image' | 'text'; accessibilityLabel: string } {
  return { accessible: true, accessibilityRole: Platform.OS === 'web' ? 'image' : 'text', accessibilityLabel: spokenUnits(label.replace(/\u00A0/g, ' ')) };
}

/**
 * A number with a small unit beside it and a label underneath. With `color`
 * (a theme colour name), the label carries a cup key in that colour; the
 * number stays in the text colour (data colours are fills, never text).
 * It is one element to a screen reader, said with its units in full (`spokenFigure`), or as `spoken` when given.
 */
export function Figure({
  value,
  unit,
  label,
  color,
  size = 'numM',
  align = 'left',
  testID,
  basis,
  spoken,
}: {
  value: string;
  unit?: string;
  label: string;
  color?: string;
  size?: 'numM' | 'numL';
  align?: 'left' | 'center';
  testID?: string;
  /** In a row that wraps: the narrowest the figure may be before it moves to the next line, so its unit stays beside the number. */
  basis?: number;
  /** What a screen reader says for the figure when its drawn words need more ("3 of 7 nights within 7 to 9 hours" for "3/7 nights"). */
  spoken?: string;
}) {
  const { colors } = useTheme();
  const key = color ? ((colors as unknown as Record<string, string>)[color] ?? color) : undefined;
  // The narrowest width grows with the text (the app's size and the phone's), so at 200% a figure takes its own line.
  const grow = useTextGrowth();
  const said = spoken ?? (value === '–' ? `${label}, none yet` : `${value}${unit ? ` ${unit}` : ''}, ${label}`);
  return (
    <View
      {...spokenFigure(said)}
      style={{ ...(basis ? { flexGrow: 1, flexBasis: basis * grow } : { flex: 1 }), minWidth: 0, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {/* The figure itself never breaks (non-breaking spaces); on a narrow phone its unit may drop to a second line rather than be cut. */}
      <Text testID={testID} variant={size} tabular numberOfLines={2}>
        {value.replace(/ /g, '\u00A0')}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
      {/* Never wider than the figure's column: a long label takes a second line instead of running into the next figure. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
        {key ? <CupKey color={key} /> : null}
        <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * Help behind an info control: one line that says what it explains, with the paragraph(s)
 * folded under it until asked for. The screen says one thing first; the "why" waits here.
 * The control is the kit's opener, a small ghost `Button` with its chevron and `expanded` (as
 * every "Show all" and Progress's "The numbers"), drawn without side padding so its words line
 * up with the card's text. A kit button keeps its label on one line, so a label too long for a
 * 320 px card passes `labelShort`, its words under 360 px (as a tile's `captionShort`).
 */
export function Explain({ label, labelShort, children, testID, style }: { label: string; labelShort?: string; children: React.ReactNode; testID: string; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const narrow = useWindowDimensions().width < 360;
  const Chevron = open ? ChevronUp : ChevronDown;
  const words = narrow && labelShort ? labelShort : label;
  return (
    <View style={style}>
      {/* 36 px tall with 4 px above and below: the 44 px row it always was, its touch area 44 px too. */}
      <Button
        testID={testID}
        title={words}
        accessibilityLabel={words}
        variant="ghost"
        size="sm"
        full={false}
        expanded={open}
        iconRight={<Chevron size={18} color={colors.actionInk} strokeWidth={2.2} />}
        onPress={() => setOpen((v) => !v)}
        style={{ paddingHorizontal: 0, marginVertical: 4 }}
      />
      {open ? (
        <View testID={`${testID}-body`} style={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** A paragraph inside `Explain`: reading text, at the body size in the secondary ink. */
export function ExplainText({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="body" color="textSecondary">
      {children}
    </Text>
  );
}

/** An info paragraph with an icon, used for "why" explanations: reading text, at the body size in the secondary ink. */
export function Note({ icon, children, style }: { icon?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, style]}>
      {icon ? (
        <View style={{ paddingTop: 4 }} {...DECORATIVE}>
          {icon}
        </View>
      ) : null}
      <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

export { splitUnit } from './helpers';

/** Large square-ish tile for one-tap adds. */
export function Tile({
  title,
  subtitle,
  icon,
  onPress,
  testID,
  accessibilityLabel,
  selected,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  selected?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="press"
      scaleTo={0.94}
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        flex: 1,
        minWidth: 72,
        minHeight: 84,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 10,
      }}>
      {icon}
      <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 16, lineHeight: 21 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/**
 * The rows of a history card (Weight, Sleep) as a list on the web, a `role="list"` holding one `listitem` per row
 * (`HistoryItem`, its divider inside it), as Train's history and the diary's rows are: a screen reader says how many
 * rows there are and can move by them. Natively a plain View (the rows are buttons in reading order).
 */
export function HistoryList({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} {...(Platform.OS === 'web' ? { role: 'list' as const } : null)}>
      {children}
    </View>
  );
}

/** One row of a `HistoryList`. */
export function HistoryItem({ children }: { children: React.ReactNode }) {
  return <View {...(Platform.OS === 'web' ? { role: 'listitem' as const } : null)}>{children}</View>;
}

/**
 * A history row of Weight and Sleep: the kit's `ListRow` as drawn (the day, its line, the value at the end and a
 * chevron), with its units spoken in full ("78.8 kilograms", "6 hours 15 minutes") and, above 115% text, the value
 * on a line of its own under the day and the line unclamped, so the day and its words keep the row's whole width
 * and no word is split.
 */
export function HistoryRow({ testID, title, subtitle, value, onPress }: { testID: string; title: string; subtitle?: string; value: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  const big = useLargeText();
  const said = spokenUnits([title, subtitle?.replace(/\u00A0/g, ' '), value].filter(Boolean).join(', ')).replace(/\bvs\b/g, 'against the');
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={said}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={big ? undefined : 2} style={{ fontFamily: fonts.semibold }}>
          {title}
        </Text>
        {big ? (
          <Text variant="label" color="text">
            {value}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={big ? undefined : 2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {big ? null : (
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {value}
        </Text>
      )}
      <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
    </PressableScale>
  );
}
