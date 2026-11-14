import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID, POPULAR_ACTIVITY_IDS, searchActivities } from '@/data/activities';
import { useTheme } from '@/theme';
import type { ActivityDef } from '@/types';
import { Divider, ListRow, SectionTitle, Sheet, Text, TextField, ToggleRow } from '@/ui';

import type { ImportCandidate } from '../plan';

import { durationLabel } from './format';

/**
 * "Which activity was this?": Garmin's own suggestions first, then a search
 * over every activity in the app. When several workouts share the same
 * unknown Garmin sport, one switch applies the choice to all of them.
 */
export function ActivitySheet({
  row,
  rows,
  onClose,
  onPick,
}: {
  row: ImportCandidate | null;
  rows: ImportCandidate[];
  onClose: () => void;
  onPick: (key: string, activityId: string, alsoKeys: string[]) => void;
}) {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(true);

  const sport = row?.workout.sport ?? '';
  // Other workouts of the same Garmin sport that still have no activity.
  const same = row && row.activityId === null && !row.workout.transition ? rows.filter((r) => r.key !== row.key && r.activityId === null && r.workout.sport === sport && !r.workout.transition && r.status !== 'already-imported' && r.status !== 'duplicate-in-file') : [];

  const suggested = (row?.suggestion.alternatives ?? []).map((id) => ACTIVITY_BY_ID[id]).filter(Boolean);
  const searching = query.trim().length > 0;
  const results: ActivityDef[] = searching
    ? searchActivities(query).slice(0, 30)
    : POPULAR_ACTIVITY_IDS.map((id) => ACTIVITY_BY_ID[id]).filter((a) => a && !suggested.some((s) => s.id === a.id)).slice(0, 10);

  const close = () => {
    setQuery('');
    onClose();
  };
  const pick = (a: ActivityDef) => {
    if (!row) return;
    onPick(row.key, a.id, all ? same.map((r) => r.key) : []);
    close();
  };

  const garminName = row?.workout.transition ? 'a change between sports (a transition)' : `“${sport.replace(/_/g, ' ')}”`;
  const row_ = (a: ActivityDef, prefix: string) => (
    <ListRow
      key={`${prefix}-${a.id}`}
      testID={`import-pick-${a.id}`}
      title={a.name}
      left={<Text style={{ fontSize: 17, lineHeight: 22, width: 24, textAlign: 'center' }}>{a.emoji}</Text>}
      onPress={() => pick(a)}
      chevron={false}
      accessibilityRole="button"
      accessibilityState={{ selected: row?.activityId === a.id }}
      right={row?.activityId === a.id ? <Text variant="label" color="textSecondary">Current</Text> : undefined}
    />
  );

  return (
    <Sheet visible={row !== null} onClose={close} title={row?.activityId ? 'Change activity' : 'Which activity was this?'}>
      {row ? (
        <View style={{ gap: spacing.md }} testID="import-activity-sheet">
          <Text variant="body" color="textSecondary">
            Garmin calls it {garminName}. {durationLabel(row.workout.durationSec)}
            {row.workout.kcal ? `, ${Math.round(row.workout.kcal)} kcal by watch` : ''}.
            {row.workout.transition ? ' Transitions are usually left out.' : ''}
          </Text>
          {same.length > 0 ? (
            <View style={{ marginVertical: -spacing.sm }}>
              <ToggleRow testID="import-pick-all" title={`Use for all ${same.length + 1} like this`} subtitle={`Every workout Garmin calls ${garminName} in this import`} value={all} onChange={setAll} />
            </View>
          ) : null}
          <TextField
            testID="import-activity-search"
            placeholder="Search activities"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            left={<Search size={18} color={colors.textSecondary} />}
          />
          {!searching && suggested.length ? (
            <View>
              <SectionTitle title="Likely" />
              {suggested.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? <Divider inset={36} /> : null}
                  {row_(a, 's')}
                </React.Fragment>
              ))}
            </View>
          ) : null}
          <View>
            <SectionTitle title={searching ? 'Results' : 'Popular'} />
            {results.length === 0 ? (
              <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.md }}>
                Nothing matches “{query.trim()}”. Try a broader word such as “ball”, “swim” or “gym”.
              </Text>
            ) : (
              results.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? <Divider inset={36} /> : null}
                  {row_(a, 'r')}
                </React.Fragment>
              ))
            )}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
