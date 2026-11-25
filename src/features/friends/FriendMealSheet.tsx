/**
 * A friend's shown meal, opened from the feed or their page. First the meal: each food with its portion
 * and where its numbers come from, in words, and its calories only when the friend showed them; Cheer and
 * Add to my diary. Add to my diary turns the same sheet into the add step: the meal and the day, the foods
 * ticked (bundled foods, in the friend's portions, priced with this phone's own numbers), and "Find" for
 * anything else, which opens search with its name. One toast with one Undo (`logItems`).
 */
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { DayStepper, KcalTrail, MealPicker, RowEmoji } from '@/features/food/components';
import { mealOnDay } from '@/features/food/addedTo';
import { portionLabel } from '@/features/food/helpers';
import { logItems } from '@/features/food/log';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { today as todayNow } from '@/lib/dates';
import { useToday } from '@/store/clock';
import { fonts, useLargeText, useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, CupKey, Divider, haptic, PressableScale, Sheet, Text } from '@/ui';

import { CheerButton } from './components';
import type { SharedMeal } from './contract';
import { copiedToast, copyItems, copyKcal, copyRows, findHref, firstTicked, type CopyRow } from './copyMeal';
import { sharedName, sharedSourceWords } from './MealCard';
import { ADD_TITLE, ADD_TO_DIARY, addButton, addFrom, addNote, FIND, friendMealTitle, KCAL_HIDDEN, NOT_IN_LIST, showLine, YOU_CHEERED } from './words';

export interface OpenMeal {
  /** The friend who shows it. */
  owner: { userId: string; displayName: string };
  meal: SharedMeal;
  cheered: boolean;
}

/**
 * The tick box of a food to add: a small cup with the app's done mark (the small filled ink cup in an ink
 * outline) when ticked; never a check, which means only a day on budget. A row that cannot be ticked has a dashed edge.
 */
function TickBox({ checked, locked }: { checked: boolean; locked: boolean }) {
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
        borderColor: checked ? colors.text : locked ? colors.dashEdge : colors.fieldEdge,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked ? <CupKey color={colors.text} size={12} /> : null}
    </View>
  );
}

/** One food of the meal as the viewer reads it: emoji, name, the portion and the source in words, calories when shown. */
function ViewRow({ row, owner, showKcal, testID }: { row: SharedMeal['items'][number]; owner: string; showKcal: boolean; testID: string }) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const source = sharedSourceWords(row.source, owner);
  const hasKcal = showKcal && typeof row.kcal === 'number';
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: 8 }}>
      <RowEmoji emoji={row.emoji} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
          {isolateRtl(sharedName(row))}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <SourceMark source={row.source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(row.source) }} />
          <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
            {`${row.portion} · ${source}`}
          </Text>
        </View>
        {hasKcal && large ? <KcalTrail value={row.kcal ?? 0} range={row.kcalLow !== undefined && row.kcalHigh !== undefined ? [row.kcalLow, row.kcalHigh] : undefined} approx={row.source === 'ai'} /> : null}
      </View>
      {hasKcal && !large ? <KcalTrail value={row.kcal ?? 0} range={row.kcalLow !== undefined && row.kcalHigh !== undefined ? [row.kcalLow, row.kcalHigh] : undefined} approx={row.source === 'ai'} /> : null}
    </View>
  );
}

/** One food in the add step: a tick box row for a bundled food, or a dashed box and "Find" for anything else. */
function AddRow({ row, owner, ticked, onToggle, onFind, testID }: { row: CopyRow; owner: string; ticked: boolean; onToggle: () => void; onFind: () => void; testID: string }) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const name = sharedName(row.item);
  if (row.kind === 'copy') {
    const caption = `${portionLabel(row.line.servingLabel, row.line.quantity)} · ${Math.round(row.kcal)} kcal`;
    return (
      <PressableScale
        testID={testID}
        onPress={onToggle}
        feedback="select"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ticked }}
        aria-checked={ticked}
        accessibilityLabel={`${withoutMarks(name)}, ${caption}`}
        focusRing="inside"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 8 }}>
        <TickBox checked={ticked} locked={false} />
        <RowEmoji emoji={row.line.emoji ?? row.item.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <SourceMark source="builtin" color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop('builtin') }} />
            <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
              {caption}
            </Text>
          </View>
        </View>
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'stretch' : 'center', gap: spacing.md, minHeight: 56, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: large ? undefined : 1, minWidth: 0 }}>
        <View {...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
          <TickBox checked={false} locked />
        </View>
        <RowEmoji emoji={row.item.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <SourceMark source={row.item.source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(row.item.source) }} />
            <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
              {`${NOT_IN_LIST} · ${sharedSourceWords(row.item.source, owner)}`}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ alignSelf: large ? 'flex-end' : 'center' }}>
        <Button testID={`${testID}-find`} title={FIND} variant="secondary" size="sm" full={false} accessibilityLabel={`${FIND} ${withoutMarks(name)} in food search`} icon={<Search size={18} color={colors.text} />} onPress={onFind} />
      </View>
    </View>
  );
}

/** The sheet: a friend's meal, then (in place) the step that adds it to the diary. */
export function FriendMealSheet({ open, startAdding, onClose, onCheer }: { open: OpenMeal | null; startAdding: boolean; onClose: () => void; onCheer: (o: OpenMeal) => void }) {
  const { spacing } = useTheme();
  const todayDate = useToday();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [step, setStep] = useState<'view' | 'add'>('view');
  const [meal, setMeal] = useState<MealType>('lunch');
  const [date, setDate] = useState<ISODate>(todayDate);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const rows = open ? copyRows(open.meal.items) : [];

  // Each time the sheet opens on a meal: its own step, the same meal type, today, every bundled food ticked.
  const key = open ? `${open.owner.userId}|${open.meal.ref}|${startAdding ? 'add' : 'view'}` : null;
  if (key !== openKey) {
    setOpenKey(key);
    if (open) {
      setStep(startAdding ? 'add' : 'view');
      setMeal(open.meal.meal);
      setDate(todayDate);
      setTicked(firstTicked(copyRows(open.meal.items)));
    }
  }

  if (!open) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const owner = open.owner.displayName;
  const m = open.meal;

  if (step === 'add') {
    const count = rows.filter((r) => r.kind === 'copy' && ticked.has(r.index)).length;
    const add = () => {
      const lines = copyItems(rows, ticked);
      if (!lines.length) return;
      // The day the person picked, said as the log toasts say it; read at the tap, never while drawing.
      logItems(lines, meal, date, copiedToast(lines, mealOnDay(meal, date, todayNow())));
      onClose();
    };
    return (
      <Sheet
        visible
        onClose={onClose}
        title={ADD_TITLE}
        subtitle={addFrom(owner, m.meal)}
        footer={<Button testID="friend-meal-add-confirm" title={addButton(count, meal, copyKcal(rows, ticked))} disabled={count === 0} onPress={add} />}>
        <View style={{ gap: spacing.md }} testID="friend-meal-add">
          <MealPicker value={meal} onChange={setMeal} testIDPrefix="friend-meal-add-meal" />
          <DayStepper value={date} onChange={setDate} testIDPrefix="friend-meal-add-day" />
          <View>
            {rows.map((r, i) => (
              <React.Fragment key={r.index}>
                {i > 0 ? <Divider inset={34} /> : null}
                <AddRow
                  row={r}
                  owner={owner}
                  ticked={ticked.has(r.index)}
                  testID={`friend-meal-add-row-${r.index}`}
                  onToggle={() =>
                    setTicked((t) => {
                      const next = new Set(t);
                      if (next.has(r.index)) next.delete(r.index);
                      else next.add(r.index);
                      return next;
                    })
                  }
                  onFind={() => {
                    if (r.kind !== 'find') return;
                    haptic.tap();
                    onClose();
                    router.push(findHref(r.query, meal, date) as never);
                  }}
                />
              </React.Fragment>
            ))}
          </View>
          <Text variant="caption" color="textSecondary" testID="friend-meal-add-note">
            {addNote(owner)}
          </Text>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={friendMealTitle(owner, m.meal)}
      subtitle={showLine(m.day, todayDate, m.items.length)}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 2 }}>
            <CheerButton testID="friend-meal-cheer" cheered={open.cheered} label={withoutMarks(friendMealTitle(owner, m.meal))} onPress={() => onCheer(open)} full />
          </View>
          <View style={{ flex: 3 }}>
            <Button testID="friend-meal-add-open" title={ADD_TO_DIARY} size="sm" onPress={() => setStep('add')} />
          </View>
        </View>
      }>
      <View testID="friend-meal" style={{ gap: spacing.md }}>
        <View>
          {m.items.map((it, i) => (
            <React.Fragment key={`${i}-${it.name}`}>
              {i > 0 ? <Divider inset={34} /> : null}
              <ViewRow row={it} owner={owner} showKcal={m.showKcal} testID={`friend-meal-row-${i}`} />
            </React.Fragment>
          ))}
        </View>
        {!m.showKcal ? (
          <Text variant="caption" color="textSecondary" testID="friend-meal-kcal-hidden">
            {KCAL_HIDDEN}
          </Text>
        ) : null}
        {open.cheered ? (
          <Text variant="caption" color="textSecondary" testID="friend-meal-cheered">
            {YOU_CHEERED}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
