import { Check, ChevronDown } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { fonts, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Badge, CupKey, PressableScale, Text } from '@/ui';

import { replaceHandLoggedPlan, type ImportCandidate } from '../plan';

import { calorieView, isTickable, metaLine, slug } from './format';

const STATUS_LABEL: Record<ImportCandidate['status'], string> = {
  new: '',
  update: 'Update available',
  'already-imported': 'Already imported',
  'duplicate-in-file': 'Listed twice',
  'probable-duplicate': 'Possible duplicate',
};

/**
 * One workout in the review list. Siblings, never nested: the tick box, the
 * main area (opens the activity choice), and below it a Restore link for a
 * workout imported before and deleted, or a Replace link for a workout that
 * looks like a session logged by hand.
 */
export function WorkoutRow({
  row,
  units,
  hour12,
  todayDate,
  onToggle,
  onChoose,
  onRestore,
  onReplace,
}: {
  row: ImportCandidate;
  units: UnitSystem;
  hour12: boolean;
  todayDate: ISODate;
  onToggle: (key: string) => void;
  onChoose: (key: string) => void;
  onRestore: (key: string) => void;
  onReplace: (key: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const w = row.workout;
  const activity = row.activityId ? ACTIVITY_BY_ID[row.activityId] : null;
  const kcal = calorieView(row);
  const tickable = isTickable(row);
  const id = slug(row.key);
  const title = activity ? activity.name : w.transition ? 'Transition' : 'Choose activity';
  const garminName = w.transition ? 'a change between sports' : `“${w.sport.replace(/_/g, ' ')}”`;
  const legNote = w.leg ? `Leg ${w.leg.number} of ${w.leg.of}` : null;
  // An update that would undo the person's own change says so instead of offering itself.
  const statusLabel = row.edited ? 'File differs from your edit' : STATUS_LABEL[row.status];
  const imported = row.status === 'already-imported';
  const meta = metaLine(w, todayDate, units, hour12);
  const replaceable = replaceHandLoggedPlan(row) !== null;

  return (
    <View testID={`import-row-${id}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingVertical: 6 }}>
      <PressableScale
        testID={`import-tick-${id}`}
        onPress={() => onToggle(row.key)}
        disabled={!tickable}
        dimDisabled={false}
        feedback="select"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: row.selected, disabled: !tickable }}
        accessibilityLabel={`${title}, ${meta}`}
        accessibilityHint={tickable ? undefined : imported ? 'Already in HealthCal' : row.activityId ? 'Cannot be imported' : 'Choose an activity first'}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
        <TickBox checked={row.selected} locked={!tickable} imported={imported} />
      </PressableScale>

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <PressableScale
          testID={`import-activity-${id}`}
          onPress={() => onChoose(row.key)}
          scaleTo={0.985}
          accessibilityLabel={activity ? `${activity.name}. Change activity` : `Choose the activity for ${garminName}`}
          accessibilityHint={kcal.spoken}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44, paddingTop: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {activity ? <Text style={{ fontSize: 17, lineHeight: 22 }}>{activity.emoji}</Text> : null}
              <Text
                variant="bodyStrong"
                numberOfLines={2}
                style={[{ fontFamily: fonts.semibold, flexShrink: 1 }, !activity && { textDecorationLine: 'underline' }]}>
                {title}
              </Text>
              <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
            </View>
            <Text variant="caption" color="textSecondary">
              {meta}
            </Text>
            {!activity ? (
              <Text variant="caption" color="textSecondary" numberOfLines={2}>
                Garmin calls it {garminName}
                {legNote ? ` · ${legNote}` : ''}
              </Text>
            ) : legNote || row.entry?.notes ? (
              <Text variant="caption" color="textSecondary" numberOfLines={2}>
                {[legNote, row.entry?.notes].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', minWidth: 76 }}>
            {kcal.added ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CupKey color={colors.exercise} size={8} variant={kcal.estimate ? 'dashed' : 'filled'} />
                <Text variant="numM" tabular style={{ fontSize: 17, lineHeight: 22 }} testID={`import-added-${id}`}>
                  {kcal.added}
                  <Text variant="unit"> kcal</Text>
                </Text>
              </View>
            ) : (
              <Text variant="numM" color="textSecondary" style={{ fontSize: 17, lineHeight: 22 }}>
                –
              </Text>
            )}
            <Text variant="caption" color="textSecondary" align="right" testID={`import-watch-${id}`}>
              {kcal.detail}
            </Text>
          </View>
        </PressableScale>

        {statusLabel ? (
          <View style={{ gap: 4, paddingBottom: 4 }}>
            <Badge label={statusLabel} color={row.status === 'probable-duplicate' ? colors.warning : colors.textSecondary} />
            {row.reason && row.reason.replace(/\.$/, '') !== statusLabel ? (
              <Text variant="caption" color="textSecondary">
                {row.reason}
              </Text>
            ) : null}
            {replaceable ? (
              <PressableScale
                testID={`import-replace-${id}`}
                accessibilityLabel="Replace my hand-logged session with this workout"
                onPress={() => onReplace(row.key)}
                hitSlop={8}
                style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
                <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
                  Replace my hand-logged session
                </Text>
              </PressableScale>
            ) : null}
            {imported && row.match?.deleted ? (
              <PressableScale testID={`import-restore-${id}`} accessibilityLabel="Restore this workout" onPress={() => onRestore(row.key)} hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
                <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
                  Restore it
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A small cup-cornered tick box. Locked rows show a dashed edge; an imported one carries a faint tick. */
function TickBox({ checked, locked, imported }: { checked: boolean; locked: boolean; imported: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        borderBottomLeftRadius: 7,
        borderBottomRightRadius: 7,
        borderWidth: 1.5,
        borderStyle: locked ? 'dashed' : 'solid',
        borderColor: checked ? colors.text : colors.borderStrong,
        backgroundColor: checked ? colors.text : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked ? <Check size={15} color={colors.bg} strokeWidth={3} /> : imported ? <Check size={14} color={colors.textTertiary} strokeWidth={2.4} /> : null}
    </View>
  );
}
