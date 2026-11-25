/**
 * The two ways into the meal photo journal (`/food/journal`): Profile's row, under Trackers, and a row in the
 * diary's meal menu. Each loads the journal's index when it shows (which also removes the files of photos that
 * can go, ./store.ts) and says how many photos are kept on this phone.
 */
import { router } from 'expo-router';
import { Images } from 'lucide-react-native';
import React, { useEffect } from 'react';

import { IconTile } from '@/features/settings/components';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { ListRow } from '@/ui';

import { JOURNAL_WORDS, shownPhotos } from './rules';
import { loadJournal, useJournal } from './store';

/** "3 photos, on this phone only", or the row's plain subtitle while there are none. */
function useCountLine(fallback: string): string {
  const photos = useJournal((s) => s.photos);
  const entries = useStore((s) => s.foodEntries);
  useEffect(() => {
    void loadJournal();
  }, []);
  const n = shownPhotos(photos ?? [], entries).length;
  return n > 0 ? `${n} ${n === 1 ? 'photo' : 'photos'}, on this phone only` : fallback;
}

export function ProfileJournalRow() {
  const { colors } = useTheme();
  const subtitle = useCountLine(JOURNAL_WORDS.rowSubtitle);
  return (
    <ListRow
      testID="profile-journal"
      title={JOURNAL_WORDS.title}
      subtitle={subtitle}
      left={
        <IconTile color={colors.calories}>
          <Images size={20} color={colors.calories} />
        </IconTile>
      }
      onPress={() => router.push('/food/journal' as never)}
    />
  );
}

/** The meal menu's row; `onClose` closes the menu before the journal opens. */
export function MealMenuJournalRow({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const subtitle = useCountLine(JOURNAL_WORDS.menuSubtitle);
  return (
    <ListRow
      testID="meal-menu-photos"
      title={JOURNAL_WORDS.title}
      subtitle={subtitle}
      left={<Images size={20} color={colors.text} />}
      onPress={() => {
        onClose();
        router.push('/food/journal' as never);
      }}
    />
  );
}
