import { router } from 'expo-router';
import { CalendarPlus, Copy, MoreHorizontal, Plus, Repeat2, Save, Trash2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { addDays, formatDayLabel } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import type { DaySummary } from '@/store/selectors';
import { cup, fonts, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { AnimatedList, AnimatedNumber, Button, Card, CupKey, Divider, Hatch, IconButton, ListRow, PressableScale, ProgressBar, Sheet, Text, TextField, Trough } from '@/ui';

import { clearEntries, copyEntries, saveMeal } from './actions';
import { DayStepper, KcalTrail, MealPicker, RowEmoji, sourceKeyVariant } from './components';
import { dayPhrase, href, kcal, portionLabel, sourceInfo } from './helpers';
import { deleteEntry } from './log';
import { FadeRow, useLeavingRows } from './rowMotion';

/**
 * The diary summary: calories left as a big number, the day as a trough
 * (eaten poured in from the left, exercise headroom hatched at the right end),
 * then the three macros with their level ticks.
 */
/** The day's numbers at the top of the diary. `share` (the day's share button) sits at the top right, beside the big number. */
export function DaySummaryCard({ day, share }: { day: DaySummary; share?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // On a phone "eaten of" always sits under the big number. Wrapping only when the number grew
  // a digit would make the whole page jump by a line as a log or a delete ticks it past 999.
  const stacked = screenW < 480;
  const over = day.remaining < 0;
  const budget = Math.max(0, day.budget);
  // Calories added by exercise, drawn as hatched headroom at the right end.
  const headroom = Math.max(0, day.budget - day.target);
  const notAdded = headroom === 0 && day.exerciseNet > 0;
  return (
    <Card testID="diary-summary" padding={18}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={stacked ? { flex: 1, minWidth: 0, gap: 2 } : { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AnimatedNumber
              variant="numXL"
              color={over ? 'warningInk' : 'caloriesInk'}
              testID="diary-remaining"
              numberOfLines={1}
              value={day.remaining}
              format={(n) => kcal(Math.abs(n))}
              accessibilityLabel={`${kcal(Math.abs(day.remaining))} kilocalories ${over ? 'over' : 'left'}`}
              style={{ fontSize: narrow ? 40 : 46, lineHeight: narrow ? 44 : 50, letterSpacing: -1.4 }}
            />
            <Text variant="unit" style={{ fontSize: 15 }}>{over ? 'kcal over' : 'kcal left'}</Text>
          </View>
          <Text variant="caption" color="textSecondary" style={{ paddingBottom: stacked ? 0 : 4 }}>
            <AnimatedNumber variant="numM" style={{ fontSize: 16, lineHeight: 20 }} testID="diary-eaten" value={day.eaten.kcal} format={kcal} />
            {' eaten of '}
            <Text variant="numM" style={{ fontSize: 16, lineHeight: 20 }}>
              {kcal(budget)}
            </Text>
          </Text>
        </View>
        {share}
      </View>
      <Trough value={day.eaten.kcal} max={budget} headroom={headroom} color={colors.calories} memoryKey={`diary-${day.date}`} style={{ marginTop: spacing.md }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 10 }}>
        <Text variant="caption" color="textSecondary" tabular>
          {`Target ${kcal(day.target)}`}
        </Text>
        {headroom > 0 || notAdded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            {headroom > 0 ? (
              <View style={{ width: 11, height: 11, overflow: 'hidden', borderWidth: 1, borderColor: colors.headroom, borderRadius: 2 }}>
                <Hatch width={11} height={11} color={colors.headroom} step={4} opacity={1} />
              </View>
            ) : null}
            <Text variant="caption" color="textSecondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
              {headroom > 0 ? `+${kcal(headroom)} from exercise` : `${kcal(day.exerciseNet)} kcal burned, not added`}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: narrow ? spacing.md : spacing.lg }}>
        {(
          [
            ['Protein', day.eaten.protein, day.macros.proteinG, colors.protein, 'reach'],
            ['Carbs', day.eaten.carbs, day.macros.carbsG, colors.carbs, 'limit'],
            ['Fat', day.eaten.fat, day.macros.fatG, colors.fat, 'limit'],
          ] as const
        ).map(([label, value, target, color, goalKind]) => (
          <View key={label} style={{ flex: 1, minWidth: 0, gap: 8 }} accessible accessibilityLabel={`${label}, ${Math.round(value)} of ${target} grams`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CupKey color={color} />
              <Text variant="label" numberOfLines={1}>
                {label}
              </Text>
            </View>
            <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} goalKind={goalKind} />
            {/* The target may wrap under the number on a narrow phone; it is never cut. */}
            <AnimatedNumber variant="numM" value={Math.round(value)} style={{ fontSize: narrow ? 15 : 17, lineHeight: narrow ? 20 : 22 }}>
              <Text variant="caption" color="textSecondary">{` / ${Math.round(target)}\u00A0g`}</Text>
            </AnimatedNumber>
          </View>
        ))}
      </View>
    </Card>
  );
}

const ROW_PAD = 18;
/** Where the text column starts in a meal card: the padding, the 24 px emoji column and the gap. */
const TEXT_INSET = ROW_PAD + 24 + 12;

function EntryRow({ entry }: { entry: FoodEntry }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // On a narrow phone the name and the portion may take two lines rather than be cut.
  const narrow = width < 360;
  // Any entry that carries a range is an estimate, whatever food it was matched to afterwards.
  const ai = !!entry.kcalRange;
  const source = sourceInfo(ai ? 'ai' : entry.source);
  const portion =
    entry.grams > 0 && entry.servingLabel !== `${Math.round(entry.grams)} g` && !/^\d+(\.\d+)?\s*g$/.test(entry.servingLabel.trim())
      ? `${portionLabel(entry.servingLabel, entry.quantity)} · ${Math.round(entry.grams)} g`
      : portionLabel(entry.servingLabel, entry.quantity);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: ROW_PAD, paddingRight: 4 }}>
      <PressableScale
        testID={`entry-${entry.id}`}
        onPress={() => router.push(href('/food/detail', { entryId: entry.id, meal: entry.meal, date: entry.date }) as never)}
        scaleTo={0.985}
        accessibilityLabel={`${entry.name}, ${ai ? 'about ' : ''}${Math.round(entry.nutrients.kcal)} kilocalories. Edit`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 11 }}>
        <RowEmoji emoji={entry.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
            {entry.name}
          </Text>
          {/* On a narrow phone the calories move to the end of the portion line, so the name has the row's width. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {/* The source's mark leads the line and its word ends it, so a portion that wraps never leaves the mark floating. */}
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }} accessible accessibilityLabel={`${portion}, ${source.label}`}>
              <CupKey color={colors.textSecondary} variant={sourceKeyVariant(ai ? 'ai' : entry.source)} size={8} style={{ marginTop: 5 }} />
              <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
                {`${portion} · ${source.short}`}
              </Text>
            </View>
            {narrow ? <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} /> : null}
          </View>
        </View>
        {narrow ? null : <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} />}
      </PressableScale>
      <IconButton testID={`entry-delete-${entry.id}`} accessibilityLabel={`Delete ${entry.name}`} tone="clear" size={36} onPress={() => deleteEntry(entry)}>
        <X size={16} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

export interface PreviousMeal {
  date: ISODate;
  entries: FoodEntry[];
}

export function MealCard({
  meal,
  label,
  emoji,
  date,
  entries,
  previous,
  onMenu,
  onRepeat,
}: {
  meal: MealType;
  label: string;
  emoji: string;
  date: ISODate;
  entries: FoodEntry[];
  previous: PreviousMeal | null;
  onMenu: () => void;
  onRepeat: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const total = entriesTotal(entries).kcal;
  const add = () => router.push(href('/food/search', { meal, date }) as never);
  // A removed row fades where it is before the rows below glide up into its place.
  const rows = useLeavingRows(entries);
  return (
    <Card testID={`meal-card-${meal}`} padding={0} style={{ paddingTop: 12, paddingBottom: rows.length ? 4 : previous ? 6 : ROW_PAD }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: ROW_PAD, paddingRight: 14 }}>
        {/* A big total ("1,450 kcal") goes under the meal's name on a narrow phone rather than cutting it. */}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}>
          <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {label}
          </Text>
          {entries.length > 0 ? (
            <AnimatedNumber variant="numM" color="textSecondary" testID={`meal-total-${meal}`} value={total} format={kcal} style={{ fontSize: 15, lineHeight: 20 }}>
              <Text variant="unit">{' kcal'}</Text>
            </AnimatedNumber>
          ) : null}
        </View>
        <IconButton testID={`meal-menu-${meal}`} accessibilityLabel={`${label} options`} tone="clear" size={44} onPress={onMenu}>
          <MoreHorizontal size={20} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
        <IconButton testID={`meal-add-${meal}`} accessibilityLabel={`Add food to ${label.toLowerCase()}`} tone="surface" size={44} onPress={add} style={{ borderColor: colors.borderStrong }}>
          <Plus size={20} color={colors.text} strokeWidth={2.2} />
        </IconButton>
      </View>
      {/* Always mounted (keyed by the day), so a meal's first row slides in too; Undo brings a row back the same way. */}
      <View style={{ marginTop: rows.length ? 6 : 0 }}>
        <AnimatedList key={date}>
          {rows.map(({ item: e, leaving }, i) => (
            <FadeRow key={e.id} leaving={leaving}>
              {i > 0 ? <Divider inset={TEXT_INSET} /> : null}
              <EntryRow entry={e} />
            </FadeRow>
          ))}
        </AnimatedList>
      </View>
      {rows.length > 0 ? null : (
        <View style={{ marginTop: spacing.sm, gap: spacing.xs, paddingHorizontal: ROW_PAD }}>
          <PressableScale
            testID={`meal-empty-${meal}`}
            onPress={add}
            scaleTo={0.985}
            accessibilityLabel={`Log ${label.toLowerCase()}`}
            style={{
              minHeight: 48,
              ...cup(radius.buttonSm, 5),
              borderWidth: 1.5,
              borderTopWidth: 0,
              borderStyle: 'dashed',
              borderColor: colors.borderStrong,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
            <Plus size={16} color={colors.textSecondary} strokeWidth={2.2} />
            <Text variant="label" color="textSecondary">
              Log {label.toLowerCase()}
            </Text>
          </PressableScale>
          {previous ? (
            <PressableScale
              testID={`meal-repeat-${meal}`}
              onPress={onRepeat}
              scaleTo={0.985}
              accessibilityLabel={`Repeat ${label.toLowerCase()} from ${formatDayLabel(previous.date)}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              {/* A fixed box, so a two-line label never squeezes the icon. */}
              <View style={{ width: 16, height: 16 }}>
                <Repeat2 size={16} color={colors.text} strokeWidth={2.2} />
              </View>
              <Text variant="label" color="text" style={{ flexShrink: 1, textDecorationLine: 'underline' }} numberOfLines={3}>
                Repeat {dayPhrase(previous.date)}: {previous.entries.map((e) => e.name.split(',')[0]).join(', ')}
              </Text>
              <Text variant="caption" color="textSecondary" tabular numberOfLines={1} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                {kcal(entriesTotal(previous.entries).kcal)} kcal
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </Card>
  );
}

type MenuStep = 'menu' | 'copyTo' | 'save';

/** Per-meal menu: copy from an earlier day, save, copy to another day, clear. */
export function MealMenuSheet({
  meal,
  date,
  entries,
  previous,
  onClose,
  onRepeat,
}: {
  meal: MealType | null;
  date: ISODate;
  entries: FoodEntry[];
  previous: PreviousMeal | null;
  onClose: () => void;
  onRepeat: () => void;
}) {
  const { colors } = useTheme();
  const todayDate = useToday();
  const [step, setStep] = useState<MenuStep>('menu');
  const [targetDate, setTargetDate] = useState<ISODate>(addDays(date, 1));
  const [targetMeal, setTargetMeal] = useState<MealType>(meal ?? 'breakfast');
  const [name, setName] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Reset the sheet each time it opens for a meal.
  const key = meal ? `${meal}|${date}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    if (meal) {
      setStep('menu');
      setTargetDate(date === todayDate ? addDays(date, 1) : todayDate);
      setTargetMeal(meal);
      setName(defaultMealName(entries, meal));
    }
  }

  if (!meal) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const label = MEAL_LABEL[meal];
  const total = entriesTotal(entries).kcal;
  const count = `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`;

  if (step === 'copyTo') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title={`Copy ${label.toLowerCase()} to`}
        footer={
          <Button
            testID="copy-to-confirm"
            title={`Copy ${count}`}
            disabled={targetDate === date && targetMeal === meal}
            onPress={() => {
              copyEntries(entries, targetDate, targetMeal, `Copied ${count} to ${dayPhrase(targetDate)}`);
              onClose();
            }}
          />
        }>
        <DayStepper value={targetDate} onChange={setTargetDate} testIDPrefix="copy-day" />
        <MealPicker value={targetMeal} onChange={setTargetMeal} testIDPrefix="copy-meal" />
      </Sheet>
    );
  }

  if (step === 'save') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Save as a meal"
        footer={
          <Button
            testID="save-meal-confirm"
            title="Save meal"
            disabled={!name.trim()}
            onPress={() => {
              saveMeal(name, entries);
              onClose();
            }}
          />
        }>
        <Text variant="body" color="textSecondary">
          {count} · {kcal(total)} kcal. Log it again later in one tap from Saved meals.
        </Text>
        <TextField testID="save-meal-name" label="Name" value={name} onChangeText={setName} autoFocus maxLength={60} returnKeyType="done" />
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title={`${label} · ${formatDayLabel(date)}`}>
      <View>
        <ListRow
          testID="meal-menu-copy-previous"
          title={previous ? `Copy from ${dayPhrase(previous.date)}` : `Copy from an earlier day`}
          subtitle={
            previous
              ? `${previous.entries.length} ${previous.entries.length === 1 ? 'item' : 'items'} · ${kcal(entriesTotal(previous.entries).kcal)} kcal`
              : `No ${label.toLowerCase()} logged in the last 60 days`
          }
          left={<Copy size={20} color={previous ? colors.text : colors.textTertiary} />}
          onPress={
            previous
              ? () => {
                  onRepeat();
                  onClose();
                }
              : undefined
          }
        />
        {entries.length > 0 ? (
          <>
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-save"
              title="Save as a meal"
              subtitle="Log the same foods again in one tap"
              left={<Save size={20} color={colors.text} />}
              onPress={() => setStep('save')}
            />
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-copy-to"
              title="Copy to another day"
              subtitle={`${count} · ${kcal(total)} kcal`}
              left={<CalendarPlus size={20} color={colors.text} />}
              onPress={() => setStep('copyTo')}
            />
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-clear"
              title={`Clear ${label.toLowerCase()}`}
              subtitle="You can undo this"
              left={<Trash2 size={20} color={colors.danger} />}
              onPress={() => {
                clearEntries(entries, label.toLowerCase());
                onClose();
              }}
            />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

function defaultMealName(entries: FoodEntry[], meal: MealType): string {
  const names = entries.slice(0, 3).map((e) => e.name.split(',')[0].trim());
  const joined = names.join(', ');
  if (!joined) return MEAL_LABEL[meal];
  return joined.length > 40 ? `${MEAL_LABEL[meal]} favourite` : joined;
}
