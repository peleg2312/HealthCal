import { BellOff, BellRing, Droplets, Footprints, MoonStar, Scale, Sparkles, Utensils } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Group, IconTile, prefers12h, TimeRow } from '@/features/settings/components';
import { reminderTimeLabel, type PlannedReminder, type ReminderKind } from '@/features/settings/reminderPlanner';
import { usePlannedReminders } from '@/features/settings/usePlannedReminders';
import { formatDuration } from '@/lib/dates';
import { getReminderPermission, remindersSupported, requestReminderPermission, type ReminderPermission } from '@/services/notifications';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Card, Chip, Header, Screen, Text, ToggleRow, toast } from '@/ui';

const INTERVALS = [60, 90, 120, 180, 240];
const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export default function RemindersScreen() {
  const { colors, spacing } = useTheme();
  const r = useStore((s) => s.settings.reminders);
  const setReminders = useStore((s) => s.setReminders);
  const units = useStore((s) => s.profile?.units);
  const hour12 = prefers12h(units);
  const [permission, setPermission] = useState<ReminderPermission | null>(remindersSupported ? null : 'unsupported');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (remindersSupported) void getReminderPermission().then(setPermission);
  }, []);

  const toggleMaster = async (on: boolean) => {
    if (!on) {
      setReminders({ enabled: false });
      return;
    }
    if (!remindersSupported) {
      setReminders({ enabled: true });
      toast('Saved. Reminders arrive in the phone app');
      return;
    }
    setAsking(true);
    const result = await requestReminderPermission();
    setAsking(false);
    setPermission(result);
    if (result === 'granted') {
      setReminders({ enabled: true });
      toast('Reminders on');
    }
  };

  const blocked = remindersSupported && r.enabled && permission === 'denied';
  const deniedNow = remindersSupported && !r.enabled && permission === 'denied';
  // The preview shows what would be sent even while the master switch is off.
  const { plan, now } = usePlannedReminders({ enabled: true });

  const off = !r.enabled;

  return (
    <Screen header={<Header title="Reminders" subtitle="Useful or silent" />}>
      <Card>
        <ToggleRow
          testID="reminders-master"
          title="Reminders"
          subtitle={
            asking
              ? 'Waiting for permission'
              : r.enabled
                ? 'On, with your live numbers'
                : 'Off'
          }
          value={r.enabled}
          onChange={(v) => void toggleMaster(v)}
          left={
            <IconTile color={r.enabled ? colors.primary : colors.textSecondary}>
              {r.enabled ? <BellRing size={20} color={colors.primary} /> : <BellOff size={20} color={colors.textSecondary} />}
            </IconTile>
          }
        />
      </Card>

      {!remindersSupported ? (
        <Card tone="alt">
          <Text variant="bodyStrong">Reminders arrive in the phone app</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: 4 }}>
            Browsers cannot schedule notifications for later, so reminders are sent by HealthCal on your iPhone or Android phone. The settings here
            are saved with your profile and the preview below shows exactly what you would receive.
          </Text>
        </Card>
      ) : null}

      {blocked || deniedNow ? (
        <Card style={{ borderColor: colors.warning }}>
          <Text variant="bodyStrong">Notifications are turned off for HealthCal</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: 4, marginBottom: spacing.md }}>
            {Platform.OS === 'ios'
              ? 'Open Settings, tap Notifications, then HealthCal, and turn on Allow Notifications. Come back here afterwards.'
              : 'Open Settings, then Apps, HealthCal, Notifications, and allow them. Come back here afterwards.'}
          </Text>
          <Button
            testID="reminders-open-settings"
            title="Open settings"
            variant="secondary"
            size="md"
            onPress={() => void Linking.openSettings().catch(() => toast('Open your phone settings to allow notifications'))}
          />
        </Card>
      ) : null}

      <Group title="Water" footer="Every reminder says how much is left today in your units. None once the goal is met.">
        <ToggleRow
          testID="reminders-water"
          title="Water reminders"
          value={r.water.enabled}
          onChange={(enabled) => setReminders({ water: { ...r.water, enabled } })}
          left={
            <IconTile color={colors.water}>
              <Droplets size={20} color={colors.water} />
            </IconTile>
          }
        />
        {r.water.enabled ? (
          <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
            <Text variant="label" color="textSecondary">
              Every
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {INTERVALS.map((m) => (
                <Chip
                  key={m}
                  testID={`reminders-interval-${m}`}
                  label={formatDuration(m)}
                  selected={r.water.everyMinutes === m}
                  onPress={() => setReminders({ water: { ...r.water, everyMinutes: m } })}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Group>

      <Group title="Meals" footer="Only when nothing is logged for that meal yet.">
        <ToggleRow
          testID="reminders-meals"
          title="Meal reminders"
          value={r.meals.enabled}
          onChange={(enabled) => setReminders({ meals: { ...r.meals, enabled } })}
          left={
            <IconTile color={colors.calories}>
              <Utensils size={20} color={colors.calories} />
            </IconTile>
          }
        />
        {r.meals.enabled ? (
          <TimeRow testID="reminders-breakfast" title="Breakfast" value={r.meals.breakfast} hour12={hour12} onChange={(breakfast) => setReminders({ meals: { ...r.meals, breakfast } })} />
        ) : null}
        {r.meals.enabled ? (
          <TimeRow testID="reminders-lunch" title="Lunch" value={r.meals.lunch} hour12={hour12} onChange={(lunch) => setReminders({ meals: { ...r.meals, lunch } })} />
        ) : null}
        {r.meals.enabled ? (
          <TimeRow testID="reminders-dinner" title="Dinner" value={r.meals.dinner} hour12={hour12} onChange={(dinner) => setReminders({ meals: { ...r.meals, dinner } })} />
        ) : null}
      </Group>

      <Group title="Daily check-in" footer="Calories, protein and water left, or a short note when the day is on track.">
        <ToggleRow
          testID="reminders-checkin"
          title="Evening check-in"
          value={r.dailySummary.enabled}
          onChange={(enabled) => setReminders({ dailySummary: { ...r.dailySummary, enabled } })}
          left={
            <IconTile color={colors.primary}>
              <Sparkles size={20} color={colors.primary} />
            </IconTile>
          }
        />
        {r.dailySummary.enabled ? (
          <TimeRow testID="reminders-checkin-time" title="Time" value={r.dailySummary.time} hour12={hour12} onChange={(time) => setReminders({ dailySummary: { ...r.dailySummary, time } })} />
        ) : null}
      </Group>

      <Group title="Weigh-in" footer="Only on the days you choose, and only if no weight is logged yet that day.">
        <ToggleRow
          testID="reminders-weighin"
          title="Weigh-in reminder"
          value={r.weighIn.enabled}
          onChange={(enabled) => setReminders({ weighIn: { ...r.weighIn, enabled } })}
          left={
            <IconTile color={colors.weight}>
              <Scale size={20} color={colors.weight} />
            </IconTile>
          }
        />
        {r.weighIn.enabled ? (
          <TimeRow testID="reminders-weighin-time" title="Time" value={r.weighIn.time} hour12={hour12} onChange={(time) => setReminders({ weighIn: { ...r.weighIn, time } })} />
        ) : null}
        {r.weighIn.enabled ? (
          <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
            <Text variant="label" color="textSecondary">
              Days
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {WEEKDAYS.map(({ day, label }) => {
                const selected = r.weighIn.weekdays.includes(day);
                return (
                  <Chip
                    key={day}
                    testID={`reminders-day-${day}`}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      const weekdays = selected ? r.weighIn.weekdays.filter((d) => d !== day) : [...r.weighIn.weekdays, day].sort();
                      setReminders({ weighIn: { ...r.weighIn, weekdays } });
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </Group>

      <Group title="Movement" footer="Only if no activity is logged that day.">
        <ToggleRow
          testID="reminders-movement"
          title="Movement nudge"
          value={r.movement.enabled}
          onChange={(enabled) => setReminders({ movement: { ...r.movement, enabled } })}
          left={
            <IconTile color={colors.exercise}>
              <Footprints size={20} color={colors.exercise} />
            </IconTile>
          }
        />
        {r.movement.enabled ? (
          <TimeRow testID="reminders-movement-time" title="Time" value={r.movement.time} hour12={hour12} onChange={(time) => setReminders({ movement: { ...r.movement, time } })} />
        ) : null}
      </Group>

      <Group title="Quiet hours" footer="Nothing is sent in this window, even if a reminder falls inside it. At most 6 reminders a day, at least 45 minutes apart.">
        <TimeRow
          testID="reminders-quiet-start"
          title="From"
          subtitle="Bedtime"
          value={r.quietStart}
          hour12={hour12}
          onChange={(quietStart) => setReminders({ quietStart })}
        />
        <TimeRow testID="reminders-quiet-end" title="Until" subtitle="Wake up" value={r.quietEnd} hour12={hour12} onChange={(quietEnd) => setReminders({ quietEnd })} />
      </Group>

      <Preview plan={plan} now={now} hour12={hour12} off={off} />
    </Screen>
  );
}

const KIND_ICON: Record<ReminderKind, (c: string) => React.ReactNode> = {
  water: (c) => <Droplets size={18} color={c} />,
  meal: (c) => <Utensils size={18} color={c} />,
  checkin: (c) => <Sparkles size={18} color={c} />,
  weighin: (c) => <Scale size={18} color={c} />,
  movement: (c) => <Footprints size={18} color={c} />,
};

function Preview({ plan, now, hour12, off }: { plan: PlannedReminder[]; now: Date; hour12: boolean; off: boolean }) {
  const { colors, spacing } = useTheme();
  const kindColor: Record<ReminderKind, string> = {
    water: colors.water,
    meal: colors.calories,
    checkin: colors.primary,
    weighin: colors.weight,
    movement: colors.exercise,
  };
  return (
    <View style={{ gap: spacing.sm }} testID="reminders-preview">
      <Text variant="overline" color="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
        Coming up
      </Text>
      <Card>
        {off ? (
          <Text variant="caption" color="textSecondary" style={{ marginBottom: spacing.md }}>
            Reminders are off. This is what you would receive with them on.
          </Text>
        ) : null}
        {plan.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.md, gap: 6 }}>
            <MoonStar size={24} color={colors.textTertiary} />
            <Text variant="bodyStrong" align="center">
              Nothing more to send
            </Text>
            <Text variant="caption" color="textSecondary" align="center">
              Either everything is logged, the day is over, or every reminder type is off.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {plan.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', gap: spacing.md }}>
                <IconTile color={kindColor[p.kind]}>{KIND_ICON[p.kind](kindColor[p.kind])}</IconTile>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {p.title}
                    </Text>
                    <Text variant="label" color="textSecondary" tabular>
                      {reminderTimeLabel(p.at, now, hour12)}
                    </Text>
                  </View>
                  <Text variant="caption" color="textSecondary">
                    {p.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}
