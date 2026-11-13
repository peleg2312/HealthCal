import { router } from 'expo-router';
import {
  Bell,
  Cloud,
  CloudOff,
  Database,
  Info,
  Moon,
  PartyPopper,
  Ruler,
  Smartphone,
  SunMoon,
  Target,
  Timer,
  Vibrate,
  Weight,
} from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Group, IconTile, InitialsAvatar } from '@/features/settings/components';
import { THEME_OPTIONS, ThemeSwatches } from '@/features/settings/ThemeSwatches';
import { timeAgo } from '@/features/settings/format';
import { toISODate } from '@/lib/dates';
import { usePlannedReminders } from '@/features/settings/usePlannedReminders';
import { formatNumber, formatWeight } from '@/lib/units';
import { useAuth } from '@/services/auth';
import { remindersSupported } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { useSyncState } from '@/services/sync';
import { useToday } from '@/store/clock';
import { pendingChanges, useStore } from '@/store';
import { useEnergyModel, useProfile, useWeightSeries } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Card, EmptyState, Header, ListRow, Screen, Segmented, Text, ToggleRow } from '@/ui';

const GOAL_LABEL = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' } as const;

export default function ProfileScreen() {
  const profile = useStore((s) => s.profile);
  if (!profile?.onboardedAt) {
    return (
      <Screen header={<Header title="Profile" />}>
        <EmptyState
          emoji="🙂"
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
  const profile = useProfile();
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

  const paceText =
    profile.goal === 'maintain' ? 'maintain' : `${profile.goal} ${formatWeight(profile.weeklyRateKg, u, 2)}/week`;

  return (
    <Screen header={<Header title="Profile" />}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <InitialsAvatar name={profile.name} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="h2" numberOfLines={1}>
              {profile.name || 'You'}
            </Text>
            <Text variant="label" color="textSecondary" numberOfLines={1}>
              {GOAL_LABEL[profile.goal]}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: spacing.lg, gap: spacing.md }}>
          <HeaderStat label="Current weight" value={formatWeight(currentKg, u)} color={colors.weight} />
          <HeaderStat label={profile.goal === 'maintain' ? 'Goal' : 'Target'} value={profile.goal === 'maintain' ? 'Maintain' : goalLine.replace('Goal ', '')} />
          <HeaderStat label="Daily budget" value={`${formatNumber(model.target.target)} kcal`} color={colors.calories} />
        </View>
      </Card>

      <Group title="Your plan">
        <ListRow
          testID="profile-goals"
          title="Goals and targets"
          subtitle={`${formatNumber(model.target.target)} kcal a day, ${paceText}`}
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

      <Group title="Body and recovery">
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
      </Group>

      <Group title="Preferences">
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
                {THEME_OPTIONS.find((o) => o.value === settings.theme)?.hint ?? 'Follows your device'}
              </Text>
            </View>
          </View>
          <View style={{ paddingTop: spacing.xs }}>
            <ThemeSwatches value={settings.theme} onChange={(theme) => setSettings({ theme })} />
          </View>
        </View>
        <ToggleRow
          testID="profile-haptics"
          title="Haptics"
          subtitle="A light tap when you log or confirm"
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
          subtitle="A small animation when you reach a goal"
          value={settings.celebrations}
          onChange={(celebrations) => setSettings({ celebrations })}
          left={
            <IconTile color={colors.carbs}>
              <PartyPopper size={20} color={colors.carbs} />
            </IconTile>
          }
        />
      </Group>

      <Group title="Account and data">
        <AccountRow />
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
          subtitle="The science behind your numbers, privacy"
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

function HeaderStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="title" tabular color={color ?? 'text'} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
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
              ? `Backed up, last synced ${when}`
              : 'Signed in, not synced yet';
  } else if (sessionLost && isBackendConfigured) {
    icon = <CloudOff size={20} color={colors.warning} />;
    tone = colors.warning;
    title = 'Signed out of your account';
    subtitle = 'Entries are safe here but not backed up. Sign in again';
  } else if (isBackendConfigured) {
    icon = <Smartphone size={20} color={colors.warning} />;
    tone = colors.warning;
    subtitle = 'On this device only. Create a free account to back up and sync';
  } else {
    icon = <Smartphone size={20} color={colors.textSecondary} />;
    subtitle = 'On this device only. Use Your data to export a backup';
  }
  return (
    <ListRow
      testID="profile-account"
      title={title}
      subtitle={subtitle}
      left={<IconTile color={tone}>{icon}</IconTile>}
      onPress={() => router.push('/settings/account')}
    />
  );
}
