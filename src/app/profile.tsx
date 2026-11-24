import { router } from 'expo-router';
import {
  Bell,
  Cloud,
  CloudOff,
  Database,
  History,
  Info,
  Moon,
  PartyPopper,
  RefreshCw,
  Ruler,
  Smartphone,
  Sunrise,
  SunMoon,
  Target,
  Timer,
  Users,
  Vibrate,
  Weight,
} from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { syncReach } from '@/features/health-sync/reach';
import { useHealthSync } from '@/features/health-sync/store';
import { healthAdapter, useHealthStatus } from '@/features/health-sync/sync';
import { profileSubtitle } from '@/features/health-sync/ui/format';
import { usePlan } from '@/features/plan/cache';
import { PlanRow } from '@/features/plan/PlanRow';
import { planVisible } from '@/features/plan/view';
import { Group, IconTile, InitialsAvatar } from '@/features/settings/components';
import { THEME_HINTS, ThemeSwatches } from '@/features/settings/ThemeSwatches';
import { TextSizeRow } from '@/features/textSize/TextSizeRow';
import { timeAgo } from '@/features/settings/format';
import { toISODate } from '@/lib/dates';
import { usePlannedReminders } from '@/features/settings/usePlannedReminders';
import { formatNumber, formatWeight } from '@/lib/units';
import { useAuth } from '@/services/auth';
import { remindersSupported } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { useSyncState } from '@/services/sync';
import { useNow, useToday } from '@/store/clock';
import { pendingChanges, useStore } from '@/store';
import { useEnergyModel, useProfile, useWeightSeries } from '@/store/selectors';
import { themeChoiceOf, themeChoicePatch, useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Card, CupKey, EmptyState, Header, ListRow, Screen, Segmented, Text, ToggleRow } from '@/ui';

const GOAL_LABEL = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' } as const;

export default function ProfileScreen() {
  const profile = useStore((s) => s.profile);
  if (!profile?.onboardedAt) {
    return (
      <Screen header={<Header title="Profile" subtitle="Settings and goals" />}>
        <EmptyState
          title="No profile yet"
          message="Set up your goals first. Your profile, targets and reminders live here afterwards."
          action="Get started"
          onAction={() => router.replace('/welcome')}
        />
      </Screen>
    );
  }
  return <ProfileHub />;
}

function ProfileHub() {
  const { colors, spacing } = useTheme();
  // Under 360 px the three header stats have about 70 px each: one-word labels keep them on one line.
  const narrow = useWindowDimensions().width < 360;
  const profile = useProfile();
  // Shown while plans are on, or while the person holds a plan (ruling R14).
  const showPlan = planVisible(usePlan());
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setProfile = useStore((s) => s.setProfile);
  const model = useEnergyModel(useToday());
  const weights = useWeightSeries();
  const u = profile.units;

  const currentKg = weights.latest?.kg ?? profile.weightKg;
  const goalLine =
    profile.goal === 'maintain' || !profile.targetWeightKg
      ? GOAL_LABEL[profile.goal]
      : `Goal ${formatWeight(profile.targetWeightKg, u)}`;

  const r = settings.reminders;
  const { plan, now } = usePlannedReminders();
  const leftToday = plan.filter((p) => toISODate(p.at) === toISODate(now)).length;
  const remindersSubtitle = r.enabled
    ? leftToday === 0
      ? 'On, nothing more today'
      : `On, ${leftToday} more today`
    : remindersSupported
      ? 'Off'
      : 'Arrive in the phone app';

  // The daily target is in the card above; the row says what else is inside.
  const paceText =
    profile.goal === 'maintain' ? 'Pace, protein, carbs, fat, water' : `${profile.goal === 'lose' ? 'Lose' : 'Gain'} ${formatWeight(profile.weeklyRateKg, u, 1)} a week, protein, carbs, fat, water`;

  return (
    <Screen header={<Header title="Profile" subtitle="Settings and goals" />}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <InitialsAvatar name={profile.name} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            {/* A long name wraps to a second line (at its hyphen, say) rather than lose its end. */}
            <Text variant="h2" numberOfLines={2}>
              {profile.name || 'You'}
            </Text>
            <Text variant="label" color="textSecondary" numberOfLines={1}>
              {GOAL_LABEL[profile.goal]}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <HeaderStat label="Weight" value={formatWeight(currentKg, u)} color={colors.weight} />
          {/* Keeping weight has no goal weight; the line under the name already says so. */}
          {profile.goal === 'maintain' || !profile.targetWeightKg ? null : <HeaderStat divider label="Goal" value={goalLine.replace('Goal ', '')} />}
          {/* The daily number before workouts is the target everywhere; "budget" is the target plus workouts (Today). */}
          <HeaderStat divider label={narrow ? 'Target' : 'Daily target'} value={`${formatNumber(model.target.target)} kcal`} color={colors.calories} />
        </View>
      </Card>

      {/* Four groups in the order a new person looks for things: you (with the Plan row), goals and reminders, what you track, the app. */}
      <Group title="You">
        <AccountRow />
        {showPlan ? <PlanRow testID="profile-plan" /> : null}
        <ListRow
          testID="profile-friends"
          title="Friends"
          subtitle="Share your training week"
          left={
            <IconTile color={colors.exercise}>
              <Users size={20} color={colors.exercise} />
            </IconTile>
          }
          onPress={() => router.push('/friends' as never)}
        />
      </Group>

      <Group title="Goals and reminders">
        <ListRow
          testID="profile-goals"
          title="Goals and targets"
          subtitle={paceText}
          left={
            <IconTile color={colors.calories}>
              <Target size={20} color={colors.calories} />
            </IconTile>
          }
          onPress={() => router.push('/settings/goals')}
        />
        <ListRow
          testID="profile-reminders"
          title="Reminders"
          subtitle={remindersSubtitle}
          left={
            <IconTile color={colors.water}>
              <Bell size={20} color={colors.water} />
            </IconTile>
          }
          onPress={() => router.push('/settings/reminders')}
        />
      </Group>

      <Group title="Trackers">
        <ListRow
          testID="profile-body"
          title="Body and measurements"
          subtitle="Weight, body fat, waist and more"
          left={
            <IconTile color={colors.weight}>
              <Ruler size={20} color={colors.weight} />
            </IconTile>
          }
          onPress={() => router.push('/body' as never)}
        />
        <ListRow
          testID="profile-sleep"
          title="Sleep"
          subtitle="Hours slept each night"
          left={
            <IconTile color={colors.sleep}>
              <Moon size={20} color={colors.sleep} />
            </IconTile>
          }
          onPress={() => router.push('/sleep' as never)}
        />
        <ListRow
          testID="profile-fasting"
          title="Fasting"
          subtitle={`${settings.fastingTargetHours} h target`}
          left={
            <IconTile color={colors.exercise}>
              <Timer size={20} color={colors.exercise} />
            </IconTile>
          }
          onPress={() => router.push('/fasting' as never)}
        />
        <HealthSyncRow />
      </Group>

      <Group title="App">
        <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconTile color={colors.primary}>
              <Weight size={20} color={colors.primary} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Units</Text>
              <Text variant="caption" color="textSecondary">
                {u === 'metric' ? 'kg, cm, ml, km' : 'lb, ft and in, fl oz, mi'}
              </Text>
            </View>
          </View>
          <Segmented<UnitSystem>
            testID="profile-units"
            value={u}
            onChange={(units) => setProfile({ units })}
            options={[
              { value: 'metric', label: 'Metric' },
              { value: 'imperial', label: 'Imperial' },
            ]}
          />
        </View>
        <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconTile color={colors.sleep}>
              <SunMoon size={20} color={colors.sleep} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Appearance</Text>
              <Text variant="caption" color="textSecondary">
                {THEME_HINTS[themeChoiceOf(settings)]}
              </Text>
            </View>
          </View>
          <View style={{ paddingTop: spacing.xs }}>
            <ThemeSwatches value={themeChoiceOf(settings)} onChange={(choice) => setSettings(themeChoicePatch(choice))} />
          </View>
        </View>
        <TextSizeRow />
        <ToggleRow
          testID="profile-haptics"
          title="Haptics"
          subtitle="A light tap when you log"
          value={settings.haptics}
          onChange={(haptics) => setSettings({ haptics })}
          left={
            <IconTile color={colors.protein}>
              <Vibrate size={20} color={colors.protein} />
            </IconTile>
          }
        />
        <ToggleRow
          testID="profile-celebrations"
          title="Celebrations"
          subtitle="A flash when you reach a goal"
          value={settings.celebrations}
          onChange={(celebrations) => setSettings({ celebrations })}
          left={
            <IconTile color={colors.carbs}>
              <PartyPopper size={20} color={colors.carbs} />
            </IconTile>
          }
        />
        <ToggleRow
          testID="profile-morning"
          title="Morning summary"
          subtitle="Yesterday at a glance, first visit each morning"
          value={settings.morningSummary !== false}
          onChange={(morningSummary) => setSettings({ morningSummary })}
          left={
            <IconTile color={colors.calories}>
              <Sunrise size={20} color={colors.calories} />
            </IconTile>
          }
        />
        <ListRow
          testID="profile-morning-open"
          title="See yesterday"
          subtitle="Open the morning summary"
          left={
            <IconTile color={colors.calories}>
              <History size={20} color={colors.calories} />
            </IconTile>
          }
          onPress={() => router.push('/morning' as never)}
        />
        <ListRow
          testID="profile-data"
          title="Your data"
          subtitle="Export, import or erase"
          left={
            <IconTile color={colors.fat}>
              <Database size={20} color={colors.fat} />
            </IconTile>
          }
          onPress={() => router.push('/settings/data')}
        />
        <ListRow
          testID="profile-about"
          title="About and how it works"
          subtitle="How the numbers work, privacy"
          left={
            <IconTile color={colors.textSecondary}>
              <Info size={20} color={colors.textSecondary} />
            </IconTile>
          }
          onPress={() => router.push('/settings/about')}
        />
      </Group>
    </Screen>
  );
}

/**
 * One stat of the header row: the number large with its unit small inside it; a cup key marks a data colour.
 * Nothing is cut: under 360 px the number steps down a size, and the label or the unit wraps to a second line.
 */
function HeaderStat({ label, value, color, divider }: { label: string; value: string; color?: string; divider?: boolean }) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const i = value.lastIndexOf(' ');
  const numeric = /^[−\-+]?[\d.,]/.test(value) && i > 0;
  const num = numeric ? value.slice(0, i) : value;
  const unit = numeric ? value.slice(i + 1) : '';
  const size = narrow ? { fontSize: numeric ? 17 : 15, lineHeight: 21 } : numeric ? undefined : { fontSize: 17 };
  return (
    <View style={{ flex: 1, minWidth: 0, paddingLeft: divider ? (narrow ? spacing.sm : spacing.md) : 0, borderLeftWidth: divider ? 1 : 0, borderLeftColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <CupKey color={color} /> : null}
        <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="numM" style={size}>
        {num}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

/** Automatic workout sync (Health Connect on Android, Apple Health on iPhone): this phone's own switch, so it reads its own state. */
function HealthSyncRow() {
  const { colors } = useTheme();
  const sync = useHealthSync();
  const now = useNow();
  // The same availability the sync screen reads, so an iPhone copy without the HealthKit entitlement or an
  // iPad without Apple Health is not invited to turn on what it cannot use.
  const status = useHealthStatus();
  const availability = healthAdapter.store === null ? 'unsupported' : status.availability;
  return (
    <ListRow
      testID="profile-health-sync"
      title="Workout sync"
      subtitle={profileSubtitle(sync, availability, timeAgo(sync.lastSyncedAt, now), syncReach(Platform.OS, false).profile)}
      left={
        <IconTile color={colors.exercise}>
          <RefreshCw size={20} color={colors.exercise} />
        </IconTile>
      }
      onPress={() => router.push('/settings/health-sync' as never)}
    />
  );
}

function AccountRow() {
  const { colors } = useTheme();
  const session = useAuth((s) => s.session);
  const sync = useSyncState();
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const pending = useStore(pendingChanges);
  const sessionLost = useAuth((s) => s.sessionLost);

  let title = 'Account and sync';
  let subtitle: string;
  let icon = <CloudOff size={20} color={colors.textSecondary} />;
  let tone = colors.textSecondary;
  let keep = false;
  if (session) {
    tone = colors.success;
    icon = <Cloud size={20} color={colors.success} />;
    title = session.user.email ?? 'Signed in';
    const when = timeAgo(sync.lastRunAt ?? lastSyncedAt);
    subtitle =
      sync.status === 'syncing'
        ? 'Syncing now'
        : sync.status === 'offline'
          ? `Offline, ${pending} change${pending === 1 ? '' : 's'} waiting`
          : sync.status === 'error'
            ? 'Sync paused, open to retry'
            : when
              ? `Backed up ${when}`
              : 'Signed in, not synced yet';
  } else if (sessionLost && isBackendConfigured) {
    icon = <CloudOff size={20} color={colors.warningInk} />;
    tone = colors.warningInk;
    keep = true;
    title = 'Signed out of your account';
    subtitle = 'Not backed up. Sign in again';
  } else if (isBackendConfigured) {
    icon = <Smartphone size={20} color={colors.warningInk} />;
    tone = colors.warningInk;
    keep = true;
    subtitle = 'On this device only. Back it up free';
  } else {
    icon = <Smartphone size={20} color={colors.textSecondary} />;
    subtitle = 'On this device only';
  }
  return (
    <ListRow
      testID="profile-account"
      title={title}
      subtitle={subtitle}
      left={
        <IconTile color={tone} keep={keep}>
          {icon}
        </IconTile>
      }
      onPress={() => router.push('/settings/account')}
    />
  );
}
