import { router } from 'expo-router';
import { FileUp, Footprints, Import, RefreshCw, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';

import { shownSteps } from '@/features/health-sync/steps';
import { useHealthSync } from '@/features/health-sync/store';
import { healthAdapter, useSyncOnFocus } from '@/features/health-sync/sync';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Card, CupKey, Divider, ListRow, Sheet } from '@/ui';

import { BRING_IN_TITLE, bringInChoices, bringInLine, choiceWords, type BringInChoice, type BringInState } from './bringIn';

const ICON: Record<BringInChoice, LucideIcon> = { sync: RefreshCw, import: FileUp, steps: Footprints };
const HREF: Record<BringInChoice, string> = { sync: '/settings/health-sync', import: '/activity/import', steps: '/activity/import' };
/** Each choice keeps the testID it had as its own control on Train (scripts and flows tap them). */
const TEST_ID: Record<BringInChoice, string> = { sync: 'train-health-sync', import: 'train-import-garmin', steps: 'train-steps-import' };

/**
 * Train's one row for workouts from elsewhere, under Log activity and Workout: "Bring in workouts"
 * with a line that says what is there or what waits (the amber key while workouts need a look or
 * the last sync did not finish) and a chevron. It opens a small sheet with the choices
 * (`bringInChoices`): automatic sync, a file import, and steps from the Health export where sync
 * cannot read them (not Android, sync off, no steps on this phone yet). Mounting it is also what makes
 * Train sync when the tab is opened. The words are `bringIn.ts`.
 */
export function BringIn({ today }: { today: ISODate }) {
  const { colors, spacing } = useTheme();
  useSyncOnFocus();
  const [open, setOpen] = useState(false);
  const enabled = useHealthSync((s) => s.enabled);
  const waiting = useHealthSync((s) => s.review.length);
  const attention = useHealthSync((s) => s.enabled && s.lastError !== null);
  const file = useHealthSync((s) => s.fileSteps);
  // As Train's steps line reads them: with sync off only a file's steps can be there.
  const hasSteps = Object.keys(shownSteps(null, file, today).days).length > 0;
  const state: BringInState = {
    enabled,
    waiting,
    attention,
    store: healthAdapter.store ?? null,
    offerSteps: Platform.OS !== 'android' && !enabled && !hasSteps,
  };
  const { line, flag } = bringInLine(state);
  const key = <CupKey color={colors.warning} size={8} />;

  const go = (choice: BringInChoice) => {
    setOpen(false);
    // Let the sheet start closing before the next screen slides in.
    setTimeout(() => router.push(HREF[choice] as never), 60);
  };

  return (
    <>
      <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow
          testID="train-bring-in"
          title={BRING_IN_TITLE}
          subtitle={line}
          left={<Import size={20} color={colors.textSecondary} strokeWidth={1.9} />}
          right={flag ? key : undefined}
          chevron
          onPress={() => setOpen(true)}
        />
      </Card>
      <Sheet visible={open} onClose={() => setOpen(false)} title={BRING_IN_TITLE}>
        <View testID="train-bring-sheet">
          {bringInChoices(state).map((choice, i) => {
            const words = choiceWords(choice, state);
            const Icon = ICON[choice];
            return (
              <React.Fragment key={choice}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  testID={TEST_ID[choice]}
                  title={words.title}
                  subtitle={words.line}
                  left={<Icon size={20} color={colors.textSecondary} strokeWidth={1.9} />}
                  right={words.flag ? key : undefined}
                  chevron
                  onPress={() => go(choice)}
                />
              </React.Fragment>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
