import { Play, Repeat, X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import { IconButton, PressableScale, Text, toast } from '@/ui';

import { lastWorkoutTemplate, routineSetCount, routineSummary, useRoutines, type RoutineTemplate } from './routines';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The routines to offer: "repeat last workout" first, then the saved ones. */
export function useRoutineTemplates(): { template: RoutineTemplate; id?: string }[] {
  const activities = useLive('activities');
  const routines = useRoutines((s) => s.routines);
  const last = lastWorkoutTemplate(activities);
  return [...(last ? [{ template: last }] : []), ...routines.map((r) => ({ template: r as RoutineTemplate, id: r.id }))];
}

/**
 * Routine cards with a full-width Start button. A saved routine can be
 * removed (with Undo); the automatic "repeat last workout" card cannot.
 */
export function RoutineCards({ onStart, testID = 'routines' }: { onStart: (t: RoutineTemplate) => void; testID?: string }) {
  const items = useRoutineTemplates();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 12 }} testID={testID}>
      {items.map(({ template, id }) => (
        <RoutineCard key={id ?? 'last'} template={template} id={id} onStart={() => onStart(template)} testID={`routine-${id ? slug(template.name) : 'last'}`} />
      ))}
    </View>
  );
}

function RoutineCard({ template, id, onStart, testID }: { template: RoutineTemplate; id?: string; onStart: () => void; testID: string }) {
  const { colors, radius, spacing } = useTheme();
  const sets = routineSetCount(template);
  const title = id ? template.name : `${template.name}${template.date ? `, ${formatShortDate(template.date)}` : ''}`;
  const remove = () => {
    if (!id) return;
    const store = useRoutines.getState();
    const index = store.routines.findIndex((r) => r.id === id);
    const removed = store.remove(id);
    if (!removed) return;
    toast(`Removed ${removed.name}`, { label: 'Undo', onPress: () => useRoutines.getState().restore(removed, index) });
  };
  return (
    <View
      testID={testID}
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            {id ? null : <Repeat size={16} color={colors.exercise} />}
            <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </Text>
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={2} testID={`${testID}-exercises`}>
            {routineSummary(template)}
          </Text>
          <Text variant="caption" color="textTertiary" tabular>
            {template.exercises.length} {template.exercises.length === 1 ? 'exercise' : 'exercises'} · {sets} {sets === 1 ? 'set' : 'sets'}
          </Text>
        </View>
        {id ? (
          <IconButton accessibilityLabel={`Remove routine ${template.name}`} testID={`${testID}-remove`} tone="clear" size={44} onPress={remove}>
            <X size={18} color={colors.textTertiary} />
          </IconButton>
        ) : null}
      </View>
      <PressableScale
        testID={`${testID}-start`}
        accessibilityLabel={`Start ${title}`}
        feedback="press"
        onPress={onStart}
        style={{
          height: 46,
          borderRadius: radius.md,
          backgroundColor: `${colors.exercise}22`,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}>
        <Play size={16} color={colors.exercise} />
        <Text variant="bodyStrong" color="text">
          Start
        </Text>
      </PressableScale>
    </View>
  );
}
