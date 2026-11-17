import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, CupKey, Sheet, Text } from '@/ui';

import { storeName, type HealthStore } from '../types';

type Read = { title: string; why: string; sleep?: boolean };

const STEPS: Read = {
  title: 'Steps',
  why: 'Your daily steps, shown on Train. Never added to your calories.',
};

const SLEEP: Read = {
  title: 'Sleep',
  why: 'How long you slept each night. Time awake or in bed is not counted, and sleep is never added to your calories.',
  sleep: true,
};

/** What each store is asked for: READ_PERMISSIONS (healthConnect.ts), READ_TYPES and SLEEP_READ_TYPES (healthKit.ts), in plain words. */
const READS: Record<HealthStore, Read[]> = {
  'health-connect': [
    { title: 'Exercise', why: 'Your workouts: what kind, when they started and ended, and their name.' },
    { title: 'Total calories burned', why: 'The workout\'s total. Only the part above your resting rate is added to your day, as for a session you log yourself.' },
    { title: 'Active calories burned', why: 'What a workout burned above resting, used when an app records no total.' },
    { title: 'Distance', why: 'How far a run, ride or swim was.' },
    STEPS,
    SLEEP,
  ],
  'apple-health': [
    { title: 'Workouts', why: 'Your workouts: what kind, when they started and ended, and the app that recorded them.' },
    { title: 'Active energy', why: 'What a workout burned above resting: what is added to your day, as for a session you log yourself.' },
    { title: 'Walking + running distance and cycling distance', why: 'How far a walk, run or ride was.' },
    STEPS,
    SLEEP,
  ],
};

/**
 * Shown before the system's own permission screen: what will be asked, what
 * each thing is for, and what is not asked. Android shows its screen only a
 * couple of times, and iOS once, so the person should know what is coming
 * before it appears.
 */
export function ExplainSheet({ store, visible, busy, onClose, onContinue }: { store: HealthStore; visible: boolean; busy: boolean; onClose: () => void; onContinue: () => void }) {
  const { colors, spacing } = useTheme();
  const name = storeName(store);
  const apple = store === 'apple-health';
  const reads = READS[store];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={apple ? 'Before your iPhone asks' : 'Before Android asks'}
      footer={<Button testID="health-sync-continue" title={`Continue to ${name}`} loading={busy} onPress={onContinue} />}>
      <View style={{ gap: spacing.md }} testID="health-sync-explain">
        <Text variant="body" color="textSecondary">
          {apple
            ? `Next, your iPhone shows ${name}'s own screen. HealthCal asks to read these:`
            : `Next, ${name} shows its own screen. HealthCal asks to read these, from the last 30 days onwards:`}
        </Text>
        <View style={{ gap: spacing.md }}>
          {reads.map((r) => (
            <View key={r.title} style={{ flexDirection: 'row', gap: spacing.md }}>
              <CupKey color={r.sleep ? colors.sleep : colors.exercise} size={9} style={{ marginTop: 6 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{r.title}</Text>
                <Text variant="caption" color="textSecondary">
                  {r.why}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text variant="body" color="textSecondary">
          {apple
            ? `It does not ask for heart rate, weight, location, clinical records or anything else, and cannot write to ${name}. You can turn any of them off; a workout may still bring its own calorie total with active energy off.`
            : `It does not ask for heart rate, weight, location or anything else, and it cannot write to ${name}. You can allow only some of them: without the calories, workouts are still added, with the app's own estimate.`}
        </Text>
      </View>
    </Sheet>
  );
}
