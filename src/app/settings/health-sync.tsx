import { router } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';

import { SpreadHint } from '@/features/activity/SpreadHint';
import { Group } from '@/features/settings/components';
import { timeAgo } from '@/features/settings/format';
import type { EnableOutcome } from '@/features/health-sync/engine';
import { sleepHandledKey } from '@/features/health-sync/sleep';
import { errorText, type SyncError } from '@/features/health-sync/state';
import { syncReach } from '@/features/health-sync/reach';
import { useHealthSync } from '@/features/health-sync/store';
import { healthAdapter, healthSync, useHealthStatus } from '@/features/health-sync/sync';
import { storeName } from '@/features/health-sync/types';
import { ActivityPickSheet } from '@/features/health-sync/ui/ActivityPickSheet';
import { ExplainSheet } from '@/features/health-sync/ui/ExplainSheet';
import { accessNote, energyRowText, heartRowText, originLine, sleepRowText, stepsRowText, switchSubtitle, weightRowText } from '@/features/health-sync/ui/format';
import { ReviewCard } from '@/features/health-sync/ui/ReviewCard';
import { useWatchEstimate } from '@/features/health-sync/ui/WatchEstimate';
import type { AccessRequest } from '@/features/health-sync/types';
import { findByDate } from '@/features/trackers/helpers';
import { isSyncedWeighIn, weighInFromLine } from '@/features/trackers/weighInSource';
import { useNow, useToday } from '@/store/clock';
import { useStore } from '@/store';
import { useEnergyModel, useLive, useProfile } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import { Button, Card, Header, ListRow, PressableScale, Screen, SectionTitle, Text, Toggle, haptic, toast } from '@/ui';

type Problem = Exclude<EnableOutcome, { ok: true }>['why'];

export default function HealthSyncScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const todayDate = useToday();
  const now = useNow();
  const state = useHealthSync();
  const status = useHealthStatus();
  const [explain, setExplain] = useState(false);
  const [asking, setAsking] = useState(false);
  /** Why turning it on did not work, until the next try. */
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  /** Last night: the sleep record dated today (the day the person woke up). */
  const lastNight = findByDate(useLive('sleep'), todayDate);
  /** Last night was deleted (or its sync undone): a sync never adds it again, so the row must not say it may come. */
  const sleepRecords = useStore((s) => s.sleep);
  const lastNightGone =
    !lastNight && (Object.values(sleepRecords).some((r) => r.date === todayDate && r.deleted) || state.handled[sleepHandledKey(todayDate)]?.how === 'skipped');

  /** The newest live weigh-in, for the Weight row. */
  const weighIns = useLive('weights');
  const newestWeighIn = weighIns.reduce<(typeof weighIns)[number] | null>((a, w) => (!a || w.date > a.date ? w : a), null);
  /** The watch's day calories, as Progress shows them (null until 5 full days). */
  const watch = useWatchEstimate(useEnergyModel(todayDate));

  const store = storeName(healthAdapter.store);
  const apple = healthAdapter.store === 'apple-health';
  // Known at once where there is no health store at all (the browser); an iPad without Apple Health says so once asked.
  const supported = healthAdapter.store !== null && status.availability !== 'unsupported';
  const ago = timeAgo(state.lastSyncedAt, now);
  const hour12 = profile.units === 'imperial';

  const turnOn = async () => {
    setAsking(true);
    const out = await healthSync.enable();
    setAsking(false);
    setExplain(false);
    status.refresh();
    if (out.ok) {
      setProblem(null);
      haptic.success();
      if (out.sync.status === 'done' && out.sync.added + out.sync.updated + out.sync.nights + out.sync.weighIns === 0) toast(out.sync.review ? 'Sync is on. Some workouts need a look' : 'Sync is on. New workouts will appear by themselves');
    } else setProblem(out.why);
  };

  const onSwitch = (on: boolean) => {
    if (!on) {
      healthSync.disable();
      setProblem(null);
      toast('Sync is off. Workouts already added stay');
      return;
    }
    if (status.availability === 'not-installed' || status.availability === 'update-required' || status.availability === 'not-entitled') {
      setProblem(status.availability);
      return;
    }
    // With permission already given there is nothing to explain or ask.
    if (status.access?.workouts) void turnOn();
    else setExplain(true);
  };

  /** Steps were added after some people allowed the first four types: ask for what is missing, and say how it went. */
  const allowSteps = async () => {
    setAsking(true);
    let allowed: boolean | null = null;
    try {
      allowed = (await healthAdapter.requestAccess('steps')).steps;
    } catch {
      allowed = null;
    }
    setAsking(false);
    status.refresh();
    if (allowed) {
      haptic.success();
      toast('Steps are shared. They show on Train after this sync');
      void healthSync.sync('manual');
    } else if (allowed === false) {
      // Refused, or Android no longer shows its sheet after two refusals: only the store's own settings can change it now.
      toast(`Steps are still not shared. Allow them in ${store}`, { label: `Open`, onPress: () => healthAdapter.openSettings() });
    } else {
      toast(`${store} did not answer. Try again in a moment`);
    }
  };

  /**
   * Sleep was added after some people allowed the first five types: ask for it
   * alone (SLEEP_PERMISSIONS, SLEEP_READ_TYPES), and say how it went.
   */
  const allowSleep = async () => {
    setAsking(true);
    let allowed: boolean | null = null;
    try {
      allowed = (await healthAdapter.requestAccess('sleep')).sleep;
    } catch {
      allowed = null;
    }
    setAsking(false);
    status.refresh();
    if (allowed && apple) {
      // Apple Health says only that it asked, never what the person chose (it keeps that private): words true either way.
      haptic.success();
      toast(`Your sleep log fills from ${store} after this sync, if you allowed sleep`, { tint: 'sleep' });
      void healthSync.sync('manual');
    } else if (allowed) {
      haptic.success();
      toast('Sleep is shared. Your nights go to the sleep log after this sync', { tint: 'sleep' });
      void healthSync.sync('manual');
    } else if (allowed === false) {
      toast(`Sleep is still not shared. Allow it in ${store}`, { label: `Open`, onPress: () => healthAdapter.openSettings() });
    } else {
      toast(`${store} did not answer. Try again in a moment`);
    }
  };

  /**
   * Weight, the day's calories and heart rate were added after people allowed the first types: each row asks
   * for its own types alone (healthConnect.ts, healthKit.ts), says how it went, and then syncs.
   */
  const allowRow = async (what: Extract<AccessRequest, 'weight' | 'dayEnergy' | 'heartRate'>) => {
    const words = ROW_WORDS[what];
    setAsking(true);
    let allowed: boolean | null = null;
    try {
      allowed = (await healthAdapter.requestAccess(what))[what];
    } catch {
      allowed = null;
    }
    setAsking(false);
    status.refresh();
    if (allowed && apple) {
      // Apple Health says only that it asked, never what the person chose: words true either way.
      haptic.success();
      toast(words.apple(store), { tint: words.tint });
      void healthSync.sync('manual');
    } else if (allowed) {
      haptic.success();
      toast(words.shared, { tint: words.tint });
      void healthSync.sync('manual');
    } else if (allowed === false) {
      toast(`${words.still} ${store}`, { label: 'Open', onPress: () => healthAdapter.openSettings() });
    } else {
      toast(`${store} did not answer. Try again in a moment`);
    }
  };

  const syncNow = async () => {
    const out = await healthSync.sync('manual');
    status.refresh();
    if (out.status === 'done' && out.added + out.updated + out.nights + out.weighIns === 0) toast(out.review ? 'Nothing new to add. Some workouts need a look' : `Up to date. Nothing new in ${store}`);
  };

  if (!supported) {
    // The browser has no health data, and an iPad without Health cannot read it (an iPhone copy without the
    // HealthKit entitlement is 'not-entitled' and gets the ProblemCard below instead). Where it does work is said
    // by reach.ts, which names Apple Health because adapter.ios.ts loads the library.
    const reach = syncReach(Platform.OS, healthAdapter.store !== null);
    return (
      <Screen header={<Header title="Workout sync" subtitle={reach.header} />} testID="health-sync-screen">
        <Card testID="health-sync-unsupported" style={{ gap: spacing.xs }}>
          <Text variant="h3">{reach.heading}</Text>
          <Text variant="body" color="textSecondary">
            {reach.body}
          </Text>
        </Card>
        {/* What works here, with the one action under it. */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="body" color="textSecondary">
            {reach.here}
          </Text>
          <Text variant="body" color="textSecondary" testID="health-sync-export-note">
            The Health app’s export brings workouts and daily steps from an iPhone. It is a snapshot: import a new one whenever you like.
          </Text>
          {/* One way in: Garmin files and the Health export open the same screen. */}
          <Button testID="health-sync-import-export" title="Import workouts" onPress={() => router.push('/activity/import')} />
        </View>
      </Screen>
    );
  }

  const unavailable = status.availability === 'not-installed' || status.availability === 'update-required' || status.availability === 'not-entitled' ? status.availability : null;
  const access = status.access ?? state.access;
  const note = state.enabled ? accessNote(access) : null;
  const pickItem = state.review.find((r) => r.id === pickFor) ?? null;
  // One thing at a time: what stops it from being turned on, else what stopped the last sync.
  const shown: Problem | null = problem ?? (state.enabled ? null : unavailable);
  const lastError: SyncError | null = state.enabled && !shown ? state.lastError : null;

  return (
    <Screen header={<Header title="Workout sync" subtitle={`From ${store}`} />} testID="health-sync-screen">
      <Card style={{ gap: spacing.sm }}>
        <Text variant="body">
          Workouts that {apple ? 'your Apple Watch, Garmin Connect' : 'Garmin Connect'} and other apps save to {store} are added to your training by themselves, with the calories your
          watch measured.
        </Text>
        <Text variant="body" color="textSecondary" testID="health-sync-steps-note">
          Your daily steps show on Train. They are never added to your calories: your activity level already counts everyday walking.
        </Text>
        <Text variant="body" color="textSecondary">
          HealthCal only reads workouts with their calories, distance and heart rate, steps, how long you slept, your weigh-ins and the calories you burn in a day. It
          writes nothing back.
        </Text>
      </Card>
      <SpreadHint testID="health-sync-spread-hint" style={{ marginVertical: -spacing.sm }} />

      <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
              Sync workouts from {store}
            </Text>
            <Text variant="caption" color="textSecondary" testID="health-sync-status">
              {status.availability === 'checking' ? 'Checking' : switchSubtitle(state, state.busy, asking, ago, store)}
            </Text>
          </View>
          <Toggle
            testID="health-sync-switch"
            accessibilityLabel={`Sync workouts from ${store}`}
            value={state.enabled}
            disabled={status.availability === 'checking' || asking}
            onChange={onSwitch}
          />
        </View>
      </Card>

      {shown ? (
        <ProblemCard
          problem={shown}
          store={store}
          apple={apple}
          onImport={() => router.push('/activity/import')}
          busy={asking}
          onInstall={() => healthAdapter.openInstall()}
          onOpen={() => healthAdapter.openSettings()}
          onRetry={() => void turnOn()}
        />
      ) : null}

      {lastError ? (
        <Card testID="health-sync-error" style={{ borderColor: colors.warning, gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text variant="bodyStrong">The last sync did not finish</Text>
            <Text variant="body" color="textSecondary">
              {errorText(lastError, store)}
            </Text>
            <Text variant="body" color="textSecondary">
              Tried {timeAgo(lastError.at, now) ?? 'just now'}. Nothing in your diary was changed.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {lastError.code === 'permission' ? (
              <Button testID="health-sync-allow-again" title="Allow again" variant="secondary" size="md" full={false} loading={asking} onPress={() => void turnOn()} />
            ) : lastError.code === 'not-installed' || lastError.code === 'update-required' ? (
              <Button
                testID="health-sync-install"
                title={lastError.code === 'update-required' ? `Update ${store}` : `Get ${store}`}
                variant="secondary"
                size="md"
                full={false}
                onPress={() => healthAdapter.openInstall()}
              />
            ) : null}
            <Button testID="health-sync-retry" title="Try again" variant={lastError.code === 'permission' ? 'ghost' : 'secondary'} size="md" full={false} loading={state.busy} onPress={() => void syncNow()} />
          </View>
        </Card>
      ) : null}

      {state.review.length ? (
        <View style={{ gap: spacing.sm }} testID="health-sync-review">
          <SectionTitle title={`Needs a look (${state.review.length})`} />
          <Text variant="body" color="textSecondary" style={{ marginTop: -spacing.xs }}>
            These were not added by themselves. Each waits here until you choose.
          </Text>
          {state.review.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              units={profile.units}
              hour12={hour12}
              todayDate={todayDate}
              onAdd={(id) => healthSync.addItem(id) && haptic.success()}
              onSkip={(id) => healthSync.skipItem(id) && haptic.tap()}
              onReplace={(id) => healthSync.replaceItem(id) && haptic.success()}
              onPick={(id, activityId) => healthSync.chooseActivity(id, activityId) && haptic.success()}
              onChoose={setPickFor}
            />
          ))}
        </View>
      ) : null}

      {state.enabled ? (
        <>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="overline" color="textSecondary">
                  Last synced
                </Text>
                <Text variant="h3" testID="health-sync-last">
                  {ago ?? 'Not yet'}
                </Text>
              </View>
              <Button
                testID="health-sync-now"
                title="Sync now"
                variant="secondary"
                size="md"
                full={false}
                loading={state.busy}
                icon={<RefreshCw size={18} color={colors.text} strokeWidth={2.2} />}
                onPress={() => void syncNow()}
              />
            </View>
            <Text variant="body" color="textSecondary">
              Runs by itself when you open HealthCal or the Train tab, at most every 15 minutes, and looks at the last 30 days of workouts.
              {state.lastResult ? ` Last change ${timeAgo(state.lastResult.at, now) ?? 'just now'}: ${changeText(state.lastResult)}.` : ''}
            </Text>
          </Card>

          <Group title="Daily steps">
            <ListRow
              testID="health-sync-steps"
              title="Steps"
              subtitle={stepsRowText(status.access ?? state.access, state.steps, todayDate, store)}
              chevron={false}
              onPress={(status.access ?? state.access)?.steps === false ? () => void allowSteps() : undefined}
              right={
                (status.access ?? state.access)?.steps === false ? (
                  <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
                    Allow
                  </Text>
                ) : undefined
              }
            />
          </Group>

          <Group title="Sleep" footer="Time awake and time in bed are not counted as sleep.">
            <ListRow
              testID="health-sync-sleep"
              title="Nights"
              subtitle={sleepRowText(status.access ?? state.access, lastNight, state.sleepReadAt, store, lastNightGone)}
              chevron={false}
              onPress={(status.access ?? state.access)?.sleep === false ? () => void allowSleep() : undefined}
              right={
                (status.access ?? state.access)?.sleep === false ? (
                  <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
                    Allow
                  </Text>
                ) : undefined
              }
            />
          </Group>

          <Group
            title="Weight"
            footer={`One a day: the first weigh-in of the day, with body fat when the same app measured it. ${
              profile?.useAdaptiveTdee === true ? 'They feed your weight trend and the burn estimate your calorie target uses.' : 'They feed your weight trend.'
            } One you enter or change yourself is never replaced, and one you delete is not added again.`}>
            <ListRow
              testID="health-sync-weight"
              title="Weigh-ins"
              subtitle={weightRowText(
                access,
                newestWeighIn ? { kg: newestWeighIn.kg, date: newestWeighIn.date, synced: isSyncedWeighIn(newestWeighIn), from: weighInFromLine(newestWeighIn)?.replace(/^From /, '') ?? null } : null,
                state.weightReadAt,
                store,
                profile.units,
                state.weightWaitingSince !== null,
              )}
              chevron={access?.weight === true}
              onPress={access?.weight === true ? () => router.push('/weight') : () => void allowRow('weight')}
              right={access?.weight === true ? undefined : <AllowLabel testID="health-sync-weight-allow" />}
            />
          </Group>

          <Group title="Calories burned in a day" footer="Your watch's own estimate, shown on Progress beside HealthCal's. It is never added to your budget.">
            <ListRow
              testID="health-sync-energy"
              title="Calories burned"
              subtitle={energyRowText(access, watch)}
              chevron={false}
              onPress={access?.dayEnergy === true ? undefined : () => void allowRow('dayEnergy')}
              right={access?.dayEnergy === true ? undefined : <AllowLabel testID="health-sync-energy-allow" />}
            />
          </Group>

          <Group title="Heart rate in workouts">
            <ListRow
              testID="health-sync-heart"
              title="Heart rate"
              subtitle={heartRowText(access)}
              chevron={false}
              onPress={access?.heartRate === true ? undefined : () => void allowRow('heartRate')}
              right={access?.heartRate === true ? undefined : <AllowLabel testID="health-sync-heart-allow" />}
            />
          </Group>

          <Group title={`Found in ${store}`} footer={note ?? undefined}>
            {state.origins.length ? (
              state.origins.map((o) => <ListRow key={o.origin} testID={`health-sync-origin-${o.origin}`} title={o.name} subtitle={originLine(o)} chevron={false} />)
            ) : (
              <View style={{ paddingVertical: spacing.md, gap: 4 }} testID="health-sync-none-found">
                <Text variant="bodyStrong">{state.lastSyncedAt ? 'No workouts in the last 30 days' : 'Nothing read yet'}</Text>
                <Text variant="body" color="textSecondary">
                  {apple
                    ? 'Apple Watch workouts arrive by themselves. Other apps share with Apple Health only after you switch that on in each app; in Garmin Connect, look for Apple Health in its settings. If you turned a type off when Apple asked, allow it in the Health app under Sharing, Apps, HealthCal.'
                    : `Apps share workouts with ${store} only after you switch that on in each app. In Garmin Connect, look for ${store} in its settings; workouts recorded after that appear here.`}
                </Text>
              </View>
            )}
          </Group>
        </>
      ) : null}

      <Group title="Stopping">
        <View style={{ paddingVertical: spacing.md, gap: 4 }}>
          <Text variant="bodyStrong">Stop at any time with the switch</Text>
          <Text variant="body" color="textSecondary">
            Once it is off, nothing more is read and the steps and daily calories kept on this phone are cleared. Workouts, nights and weigh-ins already added stay, in Train, the
            sleep log and Weight, where you can delete any of them; one you delete is not brought back by a later sync. To take the permission away as well,{' '}
            {apple ? 'open the Health app and turn HealthCal off under Sharing, Apps.' : `open ${store} and remove HealthCal under app permissions.`}
          </Text>
        </View>
        <ListRow testID="health-sync-open-store" title={`Open ${store}`} subtitle="See or change what HealthCal may read" onPress={() => healthAdapter.openSettings()} />
      </Group>

      <Group title="What happens to this data">
        <View style={{ paddingVertical: spacing.md, gap: spacing.sm }} testID="health-sync-privacy">
          <Text variant="body" color="textSecondary">
            HealthCal reads workouts and, for each, its {apple ? 'active calories' : 'active and total calories'}, distance and heart rate, your daily steps, how long you slept
            each night, your weigh-ins with body fat, and the calories you burn in a day. Nothing is written back to {store}.
          </Text>
          <Text variant="body" color="textSecondary">
            A synced workout is kept like a session you log yourself: on this phone, and in your account if you have one, so your other devices show it. It is never sent to the
            AI food estimate, and to the AI coach only inside the summary you choose to share in the coach.{apple ? ' On iPhone, nothing from Apple Health is put into that summary.' : ''} Friends, if you share with any, see what they see for every workout: its name, length, distance and date, and your weekly minutes, sessions and
            streak. Never its calories.
          </Text>
          <Text variant="body" color="textSecondary">
            Steps stay on this phone only, for the last 35 days: they are not added to your account, never sent to the AI food estimate or the AI coach, and never shown to friends.
          </Text>
          <Text variant="body" color="textSecondary">
            A night of sleep is kept in your sleep log like one you enter yourself, with the app it came from and its stages: on this phone, and in your account if you have
            one. It is never added to your calories, never sent to the AI food estimate, and to the AI coach only inside the summary you choose to share in the coach; it is never shown to friends.
          </Text>
          <Text variant="body" color="textSecondary" testID="health-sync-privacy-more">
            Weigh-ins are kept like weigh-ins you enter, in your account when you have one. Calories burned in a day stay on this phone. Heart rate is kept on the workout.
            Weigh-ins reach the AI coach only as a trend (a direction and a rate a week) inside the summary you choose to share in the coach; calories burned in a day and heart rate never go to the AI functions. None of it goes to friends.
          </Text>
        </View>
      </Group>

      <PressableScale
        testID="health-sync-import-files"
        accessibilityLabel="Import Garmin files instead"
        accessibilityRole="link"
        onPress={() => router.push('/activity/import')}
        hitSlop={6}
        style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
          Older than 30 days? Import Garmin files
        </Text>
      </PressableScale>

      <ExplainSheet store={healthAdapter.store ?? 'health-connect'} visible={explain} busy={asking} onClose={() => (asking ? undefined : setExplain(false))} onContinue={() => void turnOn()} />
      <ActivityPickSheet
        item={pickItem}
        onClose={() => setPickFor(null)}
        onPick={(id, activityId) => {
          if (healthSync.chooseActivity(id, activityId)) haptic.success();
        }}
      />
    </Screen>
  );
}

/** "1 workout added, 13 weigh-ins": workouts are named, so a count beside nights or weigh-ins is never read as theirs. */
const changeText = (r: { added: number; updated: number; nights?: number; weighIns?: number }) =>
  [
    r.added ? `${r.added} ${r.added === 1 ? 'workout' : 'workouts'} added` : '',
    r.updated ? (r.added ? `${r.updated} updated` : `${r.updated} ${r.updated === 1 ? 'workout' : 'workouts'} updated`) : '',
    r.nights ? `${r.nights} ${r.nights === 1 ? 'night' : 'nights'} of sleep` : '',
    r.weighIns ? `${r.weighIns} ${r.weighIns === 1 ? 'weigh-in' : 'weigh-ins'}` : '',
  ]
    .filter(Boolean)
    .join(', ');

/** What each row's own Allow says once asked (`allowRow`). */
const ROW_WORDS: Record<'weight' | 'dayEnergy' | 'heartRate', { tint: 'weight' | 'calories' | 'exercise'; shared: string; apple: (store: string) => string; still: string }> = {
  weight: {
    tint: 'weight',
    shared: 'Weight is shared. Your weigh-ins go to Weight after this sync',
    apple: (store) => `Your weigh-ins go to Weight from ${store} after this sync, if you allowed weight`,
    still: 'Weight is still not shared. Allow it in',
  },
  dayEnergy: {
    tint: 'calories',
    shared: 'Calories burned are shared. They show on Progress after 5 full days',
    apple: () => 'Calories burned show on Progress after 5 full days, if you allowed resting energy',
    still: 'Calories burned are still not shared. Allow them in',
  },
  heartRate: {
    tint: 'exercise',
    shared: 'Heart rate is shared. Workouts show it after this sync',
    apple: () => 'Workouts show their heart rate after this sync, if you allowed it',
    still: 'Heart rate is still not shared. Allow it in',
  },
};

/** The Allow on a row whose types are not shared yet: the row itself is the button. */
function AllowLabel({ testID }: { testID: string }) {
  return (
    <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }} testID={testID}>
      Allow
    </Text>
  );
}

/** Why sync could not be turned on, in two lines (what happened, what to do), with the one thing that fixes it. */
function ProblemCard({
  problem,
  store,
  apple,
  busy,
  onInstall,
  onOpen,
  onRetry,
  onImport,
}: {
  problem: Problem;
  store: string;
  apple: boolean;
  busy: boolean;
  onInstall: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onImport: () => void;
}) {
  const { colors, spacing } = useTheme();
  let title: string;
  let body: string;
  let action: React.ReactNode;
  if (problem === 'not-entitled') {
    title = `${store} is not available in this install`;
    body = 'This copy was signed without Apple’s Health permission, which most sideloading tools leave out. Import the Health app’s export instead: it brings workouts and daily steps, and is a snapshot you can repeat.';
    action = <Button testID="health-sync-problem-import" title="Import your Health export" variant="secondary" size="md" full={false} onPress={onImport} />;
  } else if (problem === 'not-installed') {
    title = `${store} is not on this phone`;
    body = 'Install it from Google Play, open it once, then turn sync on here.';
    action = <Button testID="health-sync-install" title={`Get ${store}`} variant="secondary" size="md" full={false} onPress={onInstall} />;
  } else if (problem === 'update-required') {
    title = `${store} needs an update`;
    body = 'Update it in Google Play, then turn sync on here.';
    action = <Button testID="health-sync-install" title={`Update ${store}`} variant="secondary" size="md" full={false} onPress={onInstall} />;
  } else if (problem === 'refused') {
    title = 'HealthCal was not given access to workouts';
    body = apple
      ? 'Allow it in the Health app under Sharing, Apps, HealthCal, then turn sync on.'
      : `Allow it in ${store} under app permissions, then turn sync on. Android stops asking after two refusals.`;
    action = (
      <>
        <Button testID="health-sync-open-permissions" title={`Open ${store}`} variant="secondary" size="sm" full={false} onPress={onOpen} />
        <Button testID="health-sync-ask-again" title="Ask again" variant="ghost" size="sm" full={false} loading={busy} onPress={onRetry} />
      </>
    );
  } else {
    title = `${store} did not answer`;
    body = 'Sync was not turned on. Try again in a moment.';
    action = <Button testID="health-sync-ask-again" title="Try again" variant="secondary" size="md" full={false} loading={busy} onPress={onRetry} />;
  }
  return (
    <Card testID={`health-sync-problem-${problem}`} style={{ borderColor: colors.warning, gap: spacing.md }}>
      <View style={{ gap: 4 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="body" color="textSecondary">
          {body}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{action}</View>
    </Card>
  );
}
