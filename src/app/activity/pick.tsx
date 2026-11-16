import { router, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Search, Timer } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACTIVITIES, ACTIVITY_BY_ID, ACTIVITY_CATEGORIES, POPULAR_ACTIVITY_IDS, searchActivities } from '@/data/activities';
import { formatDayLabel, today } from '@/lib/dates';
import { useStore } from '@/store';
import { cup, useTheme } from '@/theme';
import type { ActivityCategory, ActivityDef } from '@/types';
import { Chip, ChipRow, Divider, EmptyState, Header, ListRow, PressableScale, Screen, SectionTitle, Sheet, Text, TextField } from '@/ui';

const CATEGORY_LABEL = Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c.id, c.label])) as Record<ActivityCategory, string>;

function metRange(a: ActivityDef): string {
  const lo = a.met.light;
  const hi = a.met.vigorous;
  return lo === hi ? `${lo} MET` : `${lo}–${hi} MET`;
}

function ActivitySeparator() {
  return <Divider inset={36} />;
}

export default function PickActivityScreen() {
  const { colors, radius, spacing } = useTheme();
  const width = useWindowDimensions().width;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();
  const recentIds = useStore((s) => s.recentActivityIds);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all');
  const [strengthChoice, setStrengthChoice] = useState(false);

  const dateParam = date === today() ? '' : `&date=${date}`;
  const openLog = (id: string) => router.push(`/activity/log?activityId=${id}${dateParam}`);
  const choose = (a: ActivityDef) => {
    if (a.id === 'strength_training') setStrengthChoice(true);
    else openLog(a.id);
  };

  const searching = query.trim().length > 0;
  const list = useMemo(() => {
    const base = searchActivities(query);
    return category === 'all' ? base : base.filter((a) => a.category === category);
  }, [query, category]);

  const recents = recentIds.map((id) => ACTIVITY_BY_ID[id]).filter(Boolean).slice(0, 8);
  const popular = POPULAR_ACTIVITY_IDS.filter((id) => !recents.some((r) => r.id === id))
    .map((id) => ACTIVITY_BY_ID[id])
    .filter(Boolean)
    .slice(0, 8);
  const showShortcuts = !searching && category === 'all';

  // Train's Quick start rule (QuickStartTiles): each tile is as wide as its emoji and its whole name and
  // the tiles wrap, so a name never breaks inside a word ("Volleyba/ll") at any width.
  const grid = (items: ActivityDef[], prefix: string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID={`${prefix}-tiles`}>
      {items.map((a) => (
        <PressableScale
          key={a.id}
          testID={`${prefix}-${a.id}`}
          accessibilityLabel={a.name}
          onPress={() => choose(a)}
          scaleTo={0.96}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: 48,
            maxWidth: '100%',
            // Each line of tiles is filled edge to edge, so the block reads as a set, not a ragged cloud with a
            // short line (or one tile) left at the end.
            flexGrow: 1,
            paddingVertical: 8,
            paddingLeft: 12,
            paddingRight: 14,
            ...cup(radius.tile, 5),
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <Text style={{ fontSize: 17, lineHeight: 22 }}>{a.emoji}</Text>
          <Text variant="label" style={{ flexShrink: 1 }}>
            {a.name}
          </Text>
        </PressableScale>
      ))}
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          <Header title="Log activity" subtitle={date === today() ? `${ACTIVITIES.length} activities` : `For ${formatDayLabel(date)}`} />
          <TextField
            testID="activity-search"
            // At 320 px the examples do not fit the field.
            placeholder={width < 360 ? 'Search activities' : 'Search volleyball, yoga, rowing...'}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            left={<Search size={18} color={colors.textTertiary} />}
          />
          <ChipRow>
            <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} testID="category-all" />
            {ACTIVITY_CATEGORIES.map((c) => (
              <Chip key={c.id} label={c.label} selected={category === c.id} onPress={() => setCategory(c.id)} testID={`category-${c.id}`} />
            ))}
          </ChipRow>
        </View>
      }>
      {/* 108 rows: a virtualised list so the fastest-logging path opens without mounting them all. */}
      <FlatList
        testID="activity-list"
        data={list}
        keyExtractor={(a) => a.id}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xxl + insets.bottom }}
        ItemSeparatorComponent={ActivitySeparator}
        ListHeaderComponent={
          showShortcuts ? (
            <View style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
              {recents.length > 0 ? (
                <View style={{ gap: spacing.lg }}>
                  <SectionTitle title="Recent" />
                  {grid(recents, 'recent')}
                </View>
              ) : null}
              <SectionTitle title={recents.length ? 'Popular' : 'Popular activities'} />
              {grid(popular, 'popular')}
              <SectionTitle title="All activities" />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🔎"
            title="No activity matches"
            message={`Nothing found for "${query.trim()}"${category === 'all' ? '' : ` in ${CATEGORY_LABEL[category].toLowerCase()}`}. Try a broader word like "ball", "swim" or "dance".`}
            action={category === 'all' ? 'Clear search' : 'Search all categories'}
            onAction={() => (category === 'all' ? setQuery('') : setCategory('all'))}
          />
        }
        renderItem={({ item: a }) => (
          <ListRow
            testID={`activity-${a.id}`}
            title={a.name}
            subtitle={`${CATEGORY_LABEL[a.category]} · ${metRange(a)}${a.tracksDistance ? ' · distance' : ''}`}
            left={<View style={{ width: 24, alignItems: 'center' }}><Text style={{ fontSize: 17, lineHeight: 24 }}>{a.emoji}</Text></View>}
            onPress={() => choose(a)}
          />
        )}
      />

      <Sheet visible={strengthChoice} onClose={() => setStrengthChoice(false)} title="Strength training">
        <Text variant="body" color="textSecondary">
          Log every set as you go, or just the time and effort.
        </Text>
        <ListRow
          testID="strength-choice-sets"
          title="Set-by-set workout"
          subtitle="Exercises, weight and reps, with a timer"
          left={
            <View style={{ width: 24, alignItems: 'center' }}>
              <Dumbbell size={20} color={colors.exercise} strokeWidth={1.9} />
            </View>
          }
          onPress={() => {
            setStrengthChoice(false);
            router.push(date === today() ? '/activity/strength' : `/activity/strength?date=${date}`);
          }}
        />
        <ListRow
          testID="strength-choice-simple"
          title="Time and effort only"
          subtitle="Quickest: duration and intensity"
          left={
            <View style={{ width: 24, alignItems: 'center' }}>
              <Timer size={20} color={colors.text} strokeWidth={1.9} />
            </View>
          }
          onPress={() => {
            setStrengthChoice(false);
            openLog('strength_training');
          }}
        />
      </Sheet>
    </Screen>
  );
}
