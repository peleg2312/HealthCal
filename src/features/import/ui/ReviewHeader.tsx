import { AlertTriangle, FileWarning } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { INTENSITY_LABELS } from '@/lib/exercise';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import type { Intensity } from '@/types';
import { Card, Chip, CupKey, Divider, PressableScale, Text } from '@/ui';

import type { FileNote, RowCounts, RowFilter } from './format';
import { workouts } from './format';

/** What was found: how many workouts, how many are new, and what will be added. */
export function SummaryCard({ counts, addedKcal, csvLine, onChangeCsv }: { counts: RowCounts; addedKcal: number; csvLine: string | null; onChangeCsv: () => void }) {
  const { colors, spacing } = useTheme();
  const allKnown = counts.total > 0 && counts.locked === counts.total;
  return (
    <Card style={{ gap: spacing.md }} testID="import-summary">
      {/* The count and the calories share a row when both fit; on a narrow phone the calories go under the count. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: spacing.lg, rowGap: spacing.md }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 170, minWidth: 0 }}>
          <Text variant="numL" tabular testID="import-found">
            {formatNumber(counts.total)}
            {/* Non-breaking spaces: the unit stays in one piece, "workouts found", never "found" alone. */}
            <Text variant="unit">{counts.total === 1 ? '\u00A0workout\u00A0found' : '\u00A0workouts\u00A0found'}</Text>
          </Text>
          <Text variant="caption" color="textSecondary" testID="import-summary-line">
            {allKnown
              ? counts.deletedBefore > 0
                ? counts.total === 1
                  ? 'You imported it before and then deleted it. Restore it below.'
                  : `All were imported before; ${formatNumber(counts.deletedBefore)} deleted since, which you can restore below.`
                : counts.total === 1
                  ? 'It is already in HealthCal.'
                  : 'All of them are already in HealthCal.'
              : [
                  `${formatNumber(counts.selected)} ticked`,
                  counts.choose ? `${formatNumber(counts.choose)} need an activity` : '',
                  counts.updates ? `${formatNumber(counts.updates)} ${counts.updates === 1 ? 'update' : 'updates'} available` : '',
                  counts.edited ? `${formatNumber(counts.edited)} ${counts.edited === 1 ? 'differs' : 'differ'} from your edit` : '',
                  counts.alreadyImported ? `${formatNumber(counts.alreadyImported)} already imported` : '',
                  counts.probable ? `${formatNumber(counts.probable)} possible ${counts.probable === 1 ? 'duplicate' : 'duplicates'}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
        {addedKcal > 0 ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Text variant="numM" tabular testID="import-summary-kcal">
              +{formatNumber(addedKcal)}
              <Text variant="unit"> kcal</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CupKey color={colors.exercise} size={8} />
              <Text variant="caption" color="textSecondary">
                to add
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {allKnown ? null : <Divider />}
      {/* One line; the reason (Garmin's total includes resting) is in its accessibility label. */}
      {allKnown ? null : (
        <Text
          variant="caption"
          color="textSecondary"
          testID="import-net-note"
          accessibilityLabel="Garmin’s calories include what your body burns at rest anyway. Only the part above resting is added to each day’s budget, so nothing is counted twice.">
          Only the part above resting is added, so nothing counts twice.
        </Text>
      )}
      {csvLine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }} testID="import-csv-line">
            {csvLine}
          </Text>
          <PressableScale testID="import-csv-change" accessibilityLabel="Change the units or time zone of the CSV" onPress={onChangeCsv} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
              Change
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </Card>
  );
}

/** Per picked file: errors (not read) and warnings (read, but worth knowing), in plain words. */
export function FileNotes({ notes }: { notes: FileNote[] }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const withNotes = notes.filter((n) => n.errors.length || n.warnings.length);
  if (!withNotes.length) return null;
  const many = withNotes.length > 2;
  const shown = many && !open ? withNotes.slice(0, 2) : withNotes;
  return (
    <Card padding={0} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }} testID="import-file-notes">
      {shown.map((n, i) => (
        <View key={n.file} style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {n.errors.length ? <FileWarning size={18} color={colors.warningInk} strokeWidth={1.9} /> : <AlertTriangle size={18} color={colors.textSecondary} strokeWidth={1.9} />}
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {n.file}
            </Text>
            <Text variant="caption" color="textSecondary">
              {n.workouts ? workouts(n.workouts) : 'Not read'}
            </Text>
          </View>
          {n.errors.map((e, k) => (
            <Text key={`e${k}`} variant="caption" color="text" testID="import-file-error">
              {e.inner ? `${e.inner}: ` : ''}
              {e.message}
            </Text>
          ))}
          {n.warnings.map((w, k) => (
            <Text key={`w${k}`} variant="caption" color="textSecondary" testID={`import-warning-${w.code}`}>
              {w.inner ? `${w.inner}: ` : ''}
              {w.message}
            </Text>
          ))}
        </View>
      ))}
      {many ? (
        <PressableScale testID="import-notes-more" accessibilityLabel={open ? 'Show fewer files' : `Show all ${withNotes.length} files with notes`} onPress={() => setOpen((o) => !o)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
            {open ? 'Show fewer' : `Show all ${withNotes.length} files with notes`}
          </Text>
        </PressableScale>
      ) : null}
    </Card>
  );
}

/** Filters and bulk ticks for a long list. */
export function ListControls({
  counts,
  filter,
  onFilter,
  onSelectAll,
  estimates,
  paced,
  intensity,
  onIntensity,
}: {
  counts: RowCounts;
  filter: RowFilter;
  onFilter: (f: RowFilter) => void;
  onSelectAll: (on: boolean) => void;
  /** Rows estimated without calories (GPX), which take an effort level. */
  estimates: number;
  /** Of those, rows whose effort the pace can set (an activity with speed bands and a distance). */
  paced: number;
  intensity: Intensity | null;
  onIntensity: (i: Intensity | null) => void;
}) {
  const { spacing } = useTheme();
  const filters: { id: RowFilter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.total },
    { id: 'selected', label: 'Ticked', n: counts.selected },
    { id: 'choose', label: 'Need activity', n: counts.choose },
    { id: 'duplicates', label: 'Duplicates', n: counts.duplicates },
  ];
  return (
    <View style={{ gap: spacing.md }}>
      {estimates > 0 ? (
        <View style={{ gap: spacing.sm }} testID="import-effort">
          <Text variant="label" color="textSecondary">
            {estimates === 1 ? 'One workout has' : `${estimates} workouts have`} no calories in the file. Effort to estimate with:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md }}>
            {paced > 0 ? <Chip label="From pace" selected={intensity === null} onPress={() => onIntensity(null)} testID="import-effort-pace" /> : null}
            {(['light', 'moderate', 'vigorous'] as Intensity[]).map((i) => (
              <Chip
                key={i}
                label={INTENSITY_LABELS[i].title}
                // With nothing picked and no pace to go by, the estimate is moderate, so that chip shows as chosen.
                selected={intensity === i || (intensity === null && paced === 0 && i === 'moderate')}
                onPress={() => onIntensity(i)}
                testID={`import-effort-${i}`}
              />
            ))}
          </View>
          {paced > 0 ? (
            <Text variant="caption" color="textSecondary" testID="import-effort-note">
              {intensity === null
                ? `The average pace sets the effort${paced < estimates ? ', moderate where there is none' : ''}. Pauses count as time, so a stop-start session can read easier.`
                : `${INTENSITY_LABELS[intensity].title} is used for ${estimates === 1 ? 'this workout' : `all ${estimates}`}, whatever the pace.`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {counts.total > 1 ? (
        // Rows of chips 12 px apart, as ChipWrap: closer, the touch areas of two rows overlap.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md }}>
          {filters
            .filter((f) => f.id === 'all' || f.n > 0)
            .map((f) => (
              <Chip key={f.id} label={`${f.label} ${formatNumber(f.n)}`} selected={filter === f.id} onPress={() => onFilter(f.id)} testID={`import-filter-${f.id}`} />
            ))}
        </View>
      ) : null}
      {counts.total > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <TextLink testID="import-tick-all" label="Tick all new" onPress={() => onSelectAll(true)} />
          <TextLink testID="import-untick-all" label="Untick all" onPress={() => onSelectAll(false)} />
        </View>
      ) : null}
    </View>
  );
}

export function TextLink({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <PressableScale testID={testID} accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </PressableScale>
  );
}
