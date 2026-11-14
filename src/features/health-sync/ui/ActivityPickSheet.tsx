import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID, POPULAR_ACTIVITY_IDS, searchActivities } from '@/data/activities';
import { useTheme } from '@/theme';
import type { ActivityDef } from '@/types';
import { Divider, ListRow, SectionTitle, Sheet, Text, TextField } from '@/ui';

import { choiceKey, type ReviewItem } from '../plan';

/**
 * "Which activity was this?" for a synced workout whose type has no match:
 * the likely ones first, then a search over every activity in the app.
 */
export function ActivityPickSheet({ item, onClose, onPick }: { item: ReviewItem | null; onClose: () => void; onPick: (id: string, activityId: string) => void }) {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const likely = (item?.alternatives ?? []).map((id) => ACTIVITY_BY_ID[id]).filter(Boolean);
  const searching = query.trim().length > 0;
  const results: ActivityDef[] = searching
    ? searchActivities(query).slice(0, 30)
    : POPULAR_ACTIVITY_IDS.map((id) => ACTIVITY_BY_ID[id])
        .filter((a) => a && !likely.some((l) => l.id === a.id))
        .slice(0, 10);
  const close = () => {
    setQuery('');
    onClose();
  };
  const row = (a: ActivityDef, prefix: string) => (
    <ListRow
      key={`${prefix}-${a.id}`}
      testID={`health-pick-${a.id}`}
      title={a.name}
      left={<Text style={{ fontSize: 17, lineHeight: 22, width: 24, textAlign: 'center' }}>{a.emoji}</Text>}
      chevron={false}
      accessibilityRole="button"
      onPress={() => {
        if (item) onPick(item.id, a.id);
        close();
      }}
    />
  );
  const remembered = item ? choiceKey(item.workout) !== null : false;
  return (
    <Sheet visible={item !== null} onClose={close} title="Which activity was this?">
      {item ? (
        <View style={{ gap: spacing.md }} testID="health-activity-sheet">
          <Text variant="body" color="textSecondary">
            {item.from} recorded it as “{item.sportName.toLowerCase()}”{item.workout.title ? `, named “${item.workout.title}”` : ''}.
            {remembered ? ' Your choice is used for later workouts like this one.' : ''}
          </Text>
          <TextField
            testID="health-activity-search"
            placeholder="Search activities"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            left={<Search size={18} color={colors.textSecondary} />}
          />
          {!searching && likely.length ? (
            <View>
              <SectionTitle title="Likely" />
              {likely.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? <Divider inset={36} /> : null}
                  {row(a, 'l')}
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
                  {row(a, 'r')}
                </React.Fragment>
              ))
            )}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
