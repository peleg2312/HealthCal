import { Info, Pencil, Play, Square, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';

import { formatDuration } from '@/lib/dates';
import { deleteFast, endFast, startFast, updateFast } from '@/features/trackers/actions';
import { Figure, Note, RequireProfile } from '@/features/trackers/components';
import {
  clampFastStart,
  FASTING_PRESETS,
  fastingLabel,
  fastProgress,
  formatClockDuration,
  MAX_FAST_HOURS,
  MIN_FAST_HOURS,
  relativeDayTime,
} from '@/features/trackers/helpers';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { FastingSession } from '@/types';
import { Button, Card, Chip, CupKey, Divider, Header, IconButton, NumberField, Screen, SectionTitle, Sheet, Text, toast, Vessel } from '@/ui';

/** Current time, ticking every second while `active`. Elapsed time is always derived from stored timestamps. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [active]);
  return now;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

function TimeBlock({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text testID={testID} variant="numM" tabular numberOfLines={1} style={{ fontSize: 16, lineHeight: 21 }}>
        {value}
      </Text>
    </View>
  );
}

/** 'a 6 hour', 'an 8 hour'. */
function article(n: number): string {
  return /^(8|11|18)(\.|$)/.test(String(n)) ? 'an' : 'a';
}

function FastingScreen() {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  const sessions = useLive('fasting');
  const target = useStore((s) => s.settings.fastingTargetHours);
  const sorted = [...sessions].sort((a, b) => b.start.localeCompare(a.start));
  const active = sorted.find((s) => !s.end) ?? null;
  const done = sorted.filter((s) => !!s.end);
  const now = useNow(!!active);
  const [adjusting, setAdjusting] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState<number | null>(null);

  const activeTarget = active?.targetHours ?? target;
  const p = active ? fastProgress(active.start, active.targetHours, now) : null;
  const isPreset = FASTING_PRESETS.some((x) => x.hours === activeTarget);

  const setTarget = (hours: number) => {
    useStore.getState().setSettings({ fastingTargetHours: hours });
    if (active) updateFast(active, { targetHours: hours });
  };

  const weekAgo = now - 7 * 86_400_000;
  const recent = done.filter((s) => Date.parse(s.end!) >= weekAgo);
  const avgMs = recent.length ? recent.reduce((sum, s) => sum + fastProgress(s.start, s.targetHours, now, s.end).elapsedMs, 0) / recent.length : 0;

  const footer = active ? (
    <Button
      testID="fasting-end"
      title="End fast"
      variant="secondary"
      icon={<Square size={18} color={colors.text} />}
      onPress={() => endFast(active)}
    />
  ) : (
    <Button testID="fasting-start" title={`Start ${fastingLabel(target)} fast`} icon={<Play size={18} color={colors.onPrimary} />} onPress={() => startFast(target)} />
  );

  return (
    <Screen header={<Header title="Fasting" />} footer={footer} backdrop={colors.fat} testID="fasting-screen">
      <Card padding={18} style={{ gap: spacing.lg }} testID="fasting-hero">
        <Vessel
          value={p ? Math.min(p.elapsedMs, p.targetMs) / 3_600_000 : 0}
          max={activeTarget}
          color={colors.primary}
          width={narrow ? 72 : 88}
          height={210}
          labelGap={narrow ? 14 : 18}
          accessibilityLabel={active ? `Fasting for ${formatDuration(minutes(p?.elapsedMs ?? 0))} of ${activeTarget} hours` : 'Not fasting'}
          labels={[
            {
              key: 'target',
              at: activeTarget,
              height: 20,
              content: (
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {`Target ${fastingLabel(activeTarget)}`}
                </Text>
              ),
            },
            {
              key: 'elapsed',
              at: p ? Math.min(p.elapsedMs, p.targetMs) / 3_600_000 : 0,
              height: 64,
              tick: p && p.elapsedMs > 0 ? colors.rim : undefined,
              content: (
                <View style={{ gap: 2 }}>
                  <Text variant="overline">{active ? (p?.reached ? 'Target reached' : 'Fasting') : 'Not fasting'}</Text>
                  <Text testID="fasting-elapsed" variant="numL" tabular numberOfLines={1} style={{ fontSize: narrow ? 30 : 36, lineHeight: narrow ? 34 : 40 }}>
                    {p ? formatClockDuration(p.elapsedMs) : '0:00:00'}
                  </Text>
                </View>
              ),
            },
          ]}>
          {active ? (
            <Text variant="caption" color="textSecondary">
              {`${Math.round((p?.progress ?? 0) * 100)}% of ${activeTarget} h`}
            </Text>
          ) : null}
        </Vessel>

        {active && p ? (
          <>
            <Text testID="fasting-remaining" variant="title">
              {p.reached
                ? `Target reached ${formatDuration(Math.max(1, minutes(p.elapsedMs - p.targetMs)))} ago`
                : `${formatDuration(Math.max(1, minutes(p.remainingMs)))} to go`}
            </Text>
            <View style={{ flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, alignItems: 'center' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TimeBlock testID="fasting-started" label="Started" value={relativeDayTime(new Date(active.start), new Date(now))} />
                <IconButton testID="fasting-adjust" accessibilityLabel="Change start time" tone="surface" size={44} style={{ borderColor: colors.borderStrong }} onPress={() => setAdjusting(true)}>
                  <Pencil size={16} color={colors.text} />
                </IconButton>
              </View>
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md }} />
              <View style={{ flex: 1 }}>
                <TimeBlock label="Target time" value={relativeDayTime(p.endsAt, new Date(now))} />
              </View>
            </View>
          </>
        ) : (
          <Text variant="body" color="textSecondary">
            Start when you finish your last meal. The timer keeps running if you close the app.
          </Text>
        )}
      </Card>

      <SectionTitle title="Target" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FASTING_PRESETS.map((x) => (
          <Chip key={x.hours} testID={`fasting-target-${x.hours}`} label={x.label} selected={activeTarget === x.hours} onPress={() => setTarget(x.hours)} />
        ))}
        <Chip
          testID="fasting-target-custom"
          label={isPreset ? 'Custom' : `Custom ${fastingLabel(activeTarget)}`}
          selected={!isPreset || customOpen}
          onPress={() => {
            setCustom(activeTarget);
            setCustomOpen((v) => !v);
          }}
        />
      </View>
      {customOpen ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <NumberField testID="fasting-custom-input" style={{ flex: 1 }} label="Fasting hours" suffix="h" decimals={1} value={custom} onChange={setCustom} />
          <Button
            testID="fasting-custom-set"
            title="Set"
            variant="secondary"
            full={false}
            onPress={() => {
              if (custom === null || custom < MIN_FAST_HOURS || custom > MAX_FAST_HOURS) {
                toast(`Choose between ${MIN_FAST_HOURS} and ${MAX_FAST_HOURS} hours`);
                return;
              }
              setTarget(Math.round(custom * 2) / 2);
              setCustomOpen(false);
            }}
          />
        </View>
      ) : null}
      <Text variant="caption" color="textSecondary">
        {activeTarget < 24
          ? `${fastingLabel(activeTarget)} means ${activeTarget} hours without calories and ${article(24 - activeTarget)} ${24 - activeTarget} hour eating window. Water, black coffee and plain tea are fine.`
          : `${article(activeTarget) === 'an' ? 'An' : 'A'} ${activeTarget} hour fast. Water, black coffee and plain tea are fine.`}
      </Text>

      <SectionTitle title="History" />
      <Card padding={done.length ? spacing.md : spacing.lg} style={{ gap: done.length ? 0 : spacing.sm }}>
        {done.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Finished fasts show up here with how long they lasted.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: 4, paddingBottom: spacing.md }}>
              <Figure value={String(recent.length)} unit={recent.length === 1 ? 'fast' : 'fasts'} label="Last 7 days" />
              <Figure value={recent.length ? formatDuration(minutes(avgMs)) : '–'} label="Average length" />
            </View>
            {done.slice(0, 20).map((s, i) => {
              const fp = fastProgress(s.start, s.targetHours, now, s.end);
              return (
                <React.Fragment key={s.id}>
                  <Divider />
                  <View testID={`fasting-row-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
                    <CupKey color={fp.reached ? colors.primary : colors.textTertiary} variant={fp.reached ? 'filled' : 'outline'} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" tabular>
                        {formatDuration(minutes(fp.elapsedMs))}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {relativeDayTime(new Date(s.start), new Date(now))} to {relativeDayTime(new Date(s.end!), new Date(now))} · target {fastingLabel(s.targetHours)}
                      </Text>
                    </View>
                    <IconButton testID={`fasting-delete-${i}`} accessibilityLabel="Delete this fast" tone="clear" size={44} onPress={() => deleteFast(s)}>
                      <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
                    </IconButton>
                  </View>
                </React.Fragment>
              );
            })}
          </>
        )}
      </Card>

      <Card tone="alt">
        <Note icon={<Info size={14} color={colors.textTertiary} />}>
          Fasting is optional and not suitable for everyone, including during pregnancy, with diabetes or a history of disordered eating. Your calorie targets work the same with or without it.
        </Note>
      </Card>

      {active ? <AdjustStartSheet visible={adjusting} session={active} onClose={() => setAdjusting(false)} /> : null}
    </Screen>
  );
}

function AdjustStartSheet({ visible, session, onClose }: { visible: boolean; session: FastingSession; onClose: () => void }) {
  const [draft, setDraft] = useState(() => Date.parse(session.start));
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(Date.parse(session.start));
  }
  const shift = (mins: number) => setDraft((d) => clampFastStart(d + mins * 60_000, Date.now()));
  const steps = [-60, -15, 15, 60];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Change start time"
      footer={
        <Button
          testID="fasting-adjust-save"
          title="Save start time"
          onPress={() => {
            updateFast(session, { start: new Date(clampFastStart(draft, Date.now())).toISOString() });
            toast('Start time updated');
            onClose();
          }}
        />
      }>
      <Text variant="body" color="textSecondary">
        Forgot to start the timer? Move the start back to when you finished eating.
      </Text>
      <Text testID="fasting-adjust-value" variant="numL" align="center" tabular>
        {relativeDayTime(new Date(draft))}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {steps.map((m) => (
          <Button
            key={m}
            testID={`fasting-shift-${m}`}
            title={`${m < 0 ? '−' : '+'}${Math.abs(m) >= 60 ? `${Math.abs(m) / 60} h` : `${Math.abs(m)} min`}`}
            variant="secondary"
            size="md"
            style={{ flex: 1, paddingHorizontal: 4 }}
            onPress={() => shift(m)}
          />
        ))}
      </View>
    </Sheet>
  );
}

export default function FastingRoute() {
  return (
    <RequireProfile>
      <FastingScreen />
    </RequireProfile>
  );
}
