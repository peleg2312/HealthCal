import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatClock, formatHHmm, parseHHmm } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Button, Card, Divider, IconButton, ListRow, PressableScale, Sheet, Text } from '@/ui';

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

/** Coloured square holding a row icon. */
export function IconTile({ color, children }: { color: string; children: React.ReactNode }) {
  const { radius } = useTheme();
  return (
    <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

/** Single-choice list row with a check mark. */
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
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      testID={testID}
      right={
        <View
          accessibilityState={{ selected }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: selected ? 0 : 2,
            borderColor: colors.borderStrong,
            backgroundColor: selected ? colors.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected ? <Check size={15} color={colors.onPrimary} strokeWidth={3} /> : null}
        </View>
      }
    />
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
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm }}>
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
            style={{ marginBottom: 24, paddingHorizontal: 14, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center' }}>
            <Text variant="title">{h < 12 ? 'AM' : 'PM'}</Text>
          </PressableScale>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
        {QUICK_MINUTES.map((q) => (
          <PressableScale
            key={q}
            accessibilityLabel={`:${String(q).padStart(2, '0')}`}
            onPress={() => set(h * 60 + q)}
            style={{
              height: 40,
              minWidth: 56,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: m === q ? colors.primarySoft : colors.surface,
              borderWidth: 1,
              borderColor: m === q ? colors.primary : colors.border,
            }}>
            <Text variant="label" color={m === q ? 'text' : 'textSecondary'}>
              :{String(q).padStart(2, '0')}
            </Text>
          </PressableScale>
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
      .join('') || '🙂';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="h2" color="onPrimary" style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}>
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
