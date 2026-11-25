/**
 * Meal photos: the photos of added AI estimates, kept on this phone as a food journal (src/features/journal).
 * A grid by day, newest first; a tap opens the photo with the entries it produced, "Open in the diary" and
 * "Delete photo". Under the grid, the switch that keeps new photos and "Delete all meal photos". Nothing here
 * is uploaded, synced or exported; the privacy page says so.
 */
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { RowEmoji } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { approxKcal, approxKcalSpoken, hasEstimate } from '@/features/food/favoriteWords';
import { MealPhotoImage } from '@/features/journal/MealPhotoImage';
import { journalDays, journalDayTitle, JOURNAL_WORDS, photoMealLabel, photoTileLabel, shownPhotos, type MealPhoto } from '@/features/journal/rules';
import { deletePhoto, eraseMealPhotos, loadJournal, setKeepPhotos, useJournal } from '@/features/journal/store';
import { Group } from '@/features/settings/components';
import { addDays } from '@/lib/dates';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { cup, useLargeText, useTheme } from '@/theme';
import type { FoodEntry } from '@/types';
import { Button, ConfirmSheet, EmptyState, Header, ListRow, Note, PressableScale, Screen, SectionTitle, Sheet, Text, toast, ToggleRow } from '@/ui';

/** Each day's photos are a list on the web (`role="list"`, each tile a `listitem`), as the app's other lists are. */
const LIST = (Platform.OS === 'web' ? { role: 'list' } : null) as object | null;
const LIST_ITEM = (Platform.OS === 'web' ? { role: 'listitem' } : null) as object | null;
const GAP = 8;

/** The live entries a photo produced, in the order they were written. */
function entriesOf(photo: MealPhoto, entries: Record<string, FoodEntry>): FoodEntry[] {
  return photo.entryIds.map((id) => entries[id]).filter((e): e is FoodEntry => !!e && !e.deleted);
}

const kcalOf = (list: readonly FoodEntry[]) => list.reduce((n, e) => n + (e.nutrients?.kcal ?? 0), 0);

export default function JournalScreen() {
  const { colors, radius, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const big = useLargeText();
  const todayDate = useToday();
  const photos = useJournal((s) => s.photos);
  const keep = useJournal((s) => s.keep);
  const available = useJournal((s) => s.available);
  const entries = useStore((s) => s.foodEntries);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  useEffect(() => {
    void loadJournal();
  }, []);

  const shown = shownPhotos(photos ?? [], entries);
  const days = journalDays(shown);
  const yesterday = addDays(todayDate, -1);
  const dayTitle = (date: string) => journalDayTitle(date, todayDate, yesterday);
  // Three tiles a row (two with large text), filling the content's width.
  const perRow = big ? 2 : 3;
  const content = Math.min(width, 560) - 40;
  const tile = Math.floor((content - GAP * (perRow - 1)) / perRow);
  const open = shown.find((p) => p.id === openId) ?? null;
  const openEntries = open ? entriesOf(open, entries) : [];
  let n = 0;

  const emptyMessage = available === false ? JOURNAL_WORDS.webUnavailable : keep ? JOURNAL_WORDS.emptyMessage : JOURNAL_WORDS.offMessage;

  return (
    <Screen testID="journal-screen" header={<Header title={JOURNAL_WORDS.title} subtitle={JOURNAL_WORDS.subtitle} />}>
      {photos === null ? null : days.length === 0 ? (
        <EmptyState
          title={JOURNAL_WORDS.emptyTitle}
          message={emptyMessage}
          action={available === false ? undefined : JOURNAL_WORDS.emptyAction}
          actionTestID="journal-empty-action"
          onAction={() => router.push('/food/photo?mode=photo' as never)}
        />
      ) : (
        days.map((day) => (
          <View key={day.date} testID={`journal-day-${day.date}`} style={{ gap: spacing.sm }}>
            <SectionTitle title={dayTitle(day.date)} testID={`journal-day-title-${day.date}`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }} {...LIST}>
              {day.photos.map((p) => {
                const list = entriesOf(p, entries);
                const estimate = hasEstimate(list);
                const total = kcalOf(list);
                const names = list.map((e) => displayFoodName(e));
                const index = n++;
                return (
                  <View key={p.id} style={{ width: tile }} {...LIST_ITEM}>
                    <PressableScale
                      testID={`journal-photo-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${photoTileLabel(p, dayTitle(p.date), names)}, ${approxKcalSpoken(total, estimate)}. Open`}
                      onPress={() => setOpenId(p.id)}
                      scaleTo={0.97}
                      style={{ gap: 6 }}>
                      <MealPhotoImage id={p.id} style={{ width: tile, height: tile, ...cup(radius.tile, 5), borderWidth: 1, borderColor: colors.border }} />
                      <View>
                        <Text variant="label" numberOfLines={big ? undefined : 1}>
                          {photoMealLabel(p)}
                        </Text>
                        <Text variant="caption" color="textSecondary" numberOfLines={big ? undefined : 1}>
                          {`${approxKcal(total, estimate)} kcal`}
                        </Text>
                      </View>
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}

      {photos === null ? null : (
        <Group title="On this phone" footer={JOURNAL_WORDS.privacyNote}>
          {available === false ? (
            <Note tone="neutral" surface="card">
              {JOURNAL_WORDS.webUnavailable}
            </Note>
          ) : (
            <ToggleRow testID="journal-keep" title={JOURNAL_WORDS.keepTitle} subtitle={JOURNAL_WORDS.keepSubtitle} value={keep} onChange={setKeepPhotos} />
          )}
          {(photos ?? []).some((p) => !p.deletedAt) ? (
            <ListRow
              testID="journal-delete-all"
              title={JOURNAL_WORDS.deleteAll}
              subtitle="Your diary entries stay"
              chevron={false}
              left={<Trash2 size={20} color={colors.danger} />}
              onPress={() => setConfirmAll(true)}
            />
          ) : null}
        </Group>
      )}

      <Sheet
        visible={!!open}
        onClose={() => setOpenId(null)}
        title={open ? `${photoMealLabel(open)} · ${dayTitle(open.date)}` : undefined}
        footer={
          open ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button
                testID="journal-delete"
                variant="secondary"
                title={JOURNAL_WORDS.deleteOne}
                icon={<Trash2 size={18} color={colors.text} />}
                style={{ flexGrow: 1, flexBasis: 140 }}
                onPress={() => {
                  setOpenId(null);
                  deletePhoto(open.id);
                }}
              />
              <Button
                testID="journal-open-day"
                title={JOURNAL_WORDS.openDay}
                style={{ flexGrow: 1, flexBasis: 140 }}
                onPress={() => {
                  setOpenId(null);
                  router.push(`/diary?date=${open.date}&meal=${open.meal}` as never);
                }}
              />
            </View>
          ) : null
        }>
        {open ? (
          <View style={{ gap: spacing.md }}>
            <MealPhotoImage
              id={open.id}
              style={{ width: '100%', aspectRatio: open.width > 0 && open.height > 0 ? Math.max(1, open.width / open.height) : 4 / 3, ...cup(radius.card), borderWidth: 1, borderColor: colors.border }}
            />
            <View testID="journal-sheet-entries" {...LIST}>
              {openEntries.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 }} {...LIST_ITEM}>
                  <RowEmoji emoji={e.emoji} />
                  <Text variant="body" style={{ flex: 1, minWidth: 0 }}>
                    {displayFoodName(e)}
                  </Text>
                  <Text variant="body" color="textSecondary" tabular>
                    {`${approxKcal(e.nutrients?.kcal ?? 0, Array.isArray(e.kcalRange))} kcal`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirmAll}
        title={JOURNAL_WORDS.deleteAllQuestion}
        message={JOURNAL_WORDS.deleteAllMessage}
        confirmLabel={JOURNAL_WORDS.deleteAll}
        destructive
        onConfirm={() => {
          setConfirmAll(false);
          void eraseMealPhotos().then(() => toast(JOURNAL_WORDS.allDeleted));
        }}
        onCancel={() => setConfirmAll(false)}
      />
    </Screen>
  );
}
