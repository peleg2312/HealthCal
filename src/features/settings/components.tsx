import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatClock, formatHHmm, parseHHmm } from '@/lib/dates';
import { cup, cupFor, useTheme } from '@/theme';
import { Button, Card, Chip, Divider, IconButton, ListRow, PressableScale, Sheet, Text } from '@/ui';

/** A titled card of rows separated by hairlines. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <Text variant="overline" color="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
          {title}
        </Text>
      ) : null}
      <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Divider /> : null}
            {child}
          </React.Fragment>
        ))}
      </Card>
      {footer ? (
        <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: spacing.xs }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The leading mark of a settings row. Pour has no tinted icon tiles: the
 * Lucide icon stands alone, 20 px with stroke 1.9, in textSecondary. A
 * warning or danger `color` (or `keep`) leaves the icon's own colour, since
 * there the colour is a status; any other colour is ignored.
 */
export function IconTile({ color, keep, children }: { color?: string; keep?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  // A status colour (warning, danger) carries meaning, so it stays; any other colour gives way to the neutral icon.
  const own = keep || (!!color && (color === colors.warning || color === colors.danger));
  const child = React.isValidElement<{ color?: string; size?: number; strokeWidth?: number }>(children)
    ? React.cloneElement(children, { ...(own ? null : { color: colors.textSecondary }), size: 20, strokeWidth: 1.9 })
    : children;
  return <View style={{ width: 24, height: 36, alignItems: 'center', justifyContent: 'center' }}>{child}</View>;
}

/**
 * Single-choice list row with a check mark. Announced as a radio button with
 * its checked state, so screen readers say which option is in effect.
 */
export function OptionRow({
  title,
  subtitle,
  selected,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      scaleTo={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* A small cup: an ink cup with a check when chosen, an empty outline otherwise. */}
      <View
        style={{
          width: 24,
          height: 24,
          ...cupFor(24),
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderStrong,
          backgroundColor: selected ? colors.text : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected ? <Check size={15} color={colors.bg} strokeWidth={3} /> : null}
      </View>
    </PressableScale>
  );
}

function Spinner({ label, onChange, format }: { label: string; onChange: (delta: number) => void; format: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <IconButton accessibilityLabel={`Later ${label}`} tone="alt" size={48} onPress={() => onChange(1)} testID={`time-${label}-up`}>
        <ChevronUp size={22} color={colors.text} />
      </IconButton>
      <Text variant="numXL" tabular style={{ minWidth: 84, textAlign: 'center' }}>
        {format}
      </Text>
      <IconButton accessibilityLabel={`Earlier ${label}`} tone="alt" size={48} onPress={() => onChange(-1)} testID={`time-${label}-down`}>
        <ChevronDown size={22} color={colors.text} />
      </IconButton>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}

const QUICK_MINUTES = [0, 15, 30, 45];

/**
 * Time picker in a sheet: hour and minute spinners plus quick minute chips.
 * Plain pressables, so it behaves the same on iOS, Android and web.
 */
export function TimeSheet({
  visible,
  title,
  value,
  hour12,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  value: string;
  hour12?: boolean;
  onClose: () => void;
  onSave: (hhmm: string) => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const [minutes, setMinutes] = useState(parseHHmm(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setMinutes(parseHHmm(value));
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const set = (n: number) => setMinutes(((n % 1440) + 1440) % 1440);
  const hourLabel = hour12 ? String(h % 12 === 0 ? 12 : h % 12) : String(h).padStart(2, '0');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={<Button title="Set time" testID="time-save" onPress={() => onSave(formatHHmm(minutes))} />}>
      {/* With the AM/PM switch the row needs 12 px gaps to stay inside the sheet's padding on a 320 px phone. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: hour12 ? spacing.md : spacing.lg, paddingVertical: spacing.sm }}>
        <Spinner label="hour" format={hourLabel} onChange={(d) => set(minutes + d * 60)} />
        <Text variant="numXL" color="textTertiary" style={{ marginBottom: 24 }}>
          :
        </Text>
        <Spinner label="minute" format={String(m).padStart(2, '0')} onChange={(d) => set(h * 60 + ((m + d * 5 + 60) % 60))} />
        {hour12 ? (
          <PressableScale
            accessibilityLabel={h < 12 ? 'Switch to PM' : 'Switch to AM'}
            testID="time-ampm"
            onPress={() => set(minutes + (h < 12 ? 720 : -720))}
            style={{ marginBottom: 24, paddingHorizontal: 14, height: 44, ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center' }}>
            <Text variant="title">{h < 12 ? 'AM' : 'PM'}</Text>
          </PressableScale>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
        {QUICK_MINUTES.map((q) => (
          <Chip key={q} label={`:${String(q).padStart(2, '0')}`} selected={m === q} onPress={() => set(h * 60 + q)} style={{ minWidth: 56, justifyContent: 'center' }} />
        ))}
      </View>
    </Sheet>
  );
}

/** Row showing a time that opens the time sheet. */
export function TimeRow({
  title,
  subtitle,
  value,
  hour12,
  onChange,
  testID,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: string;
  hour12?: boolean;
  onChange: (hhmm: string) => void;
  testID?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={title}
        subtitle={subtitle}
        value={formatClock(value, hour12)}
        onPress={disabled ? undefined : () => setOpen(true)}
        chevron={!disabled}
        testID={testID}
      />
      <TimeSheet
        visible={open}
        title={title}
        value={value}
        hour12={hour12}
        onClose={() => setOpen(false)}
        onSave={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </>
  );
}

/** Initials avatar for the profile header. */
export function InitialsAvatar({ name, size = 64 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'Me';
  return (
    // A cup tile with initials in Bricolage (Pour avatars are never round and never emoji).
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, ...cupFor(size), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="h2" color="text" style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}>
        {initials}
      </Text>
    </View>
  );
}

/** Small explanatory paragraph used under form controls. */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" color="textSecondary">
      {children}
    </Text>
  );
}

/** Whether the user's units suggest a 12-hour clock. */
export function prefers12h(units: 'metric' | 'imperial' | undefined): boolean {
  return units === 'imperial';
}
