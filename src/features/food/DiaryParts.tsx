import { router } from 'expo-router';
import { CalendarPlus, Copy, MoreHorizontal, Plus, Save, Trash2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { addDays, formatDayLabel, fromISODate, startOfWeek, today } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import type { DaySummary } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Avatar, Button, Card, Divider, IconButton, ListRow, PressableScale, ProgressBar, Sheet, Text, TextField } from '@/ui';

import { clearEntries, copyEntries, saveMeal } from './actions';
import { DayStepper, MacroStat, MealPicker, SourceTag } from './components';
import { dayPhrase, href, kcal, portionLabel } from './helpers';
import { deleteEntry } from './log';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-to-Sunday strip for the week around `date`; a dot marks days with food logged. */
export function WeekStrip({ date, logged, onSelect }: { date: ISODate; logged: Set<ISODate>; onSelect: (d: ISODate) => void }) {
  const { colors, radius } = useTheme();
  const start = startOfWeek(date);
  const t = today();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="tablist">
      {LETTERS.map((letter, i) => {
        const d = addDays(start, i);
        const selected = d === date;
        const isToday = d === t;
        const has = logged.has(d);
        return (
          <PressableScale
            key={d}
            testID={`week-day-${d}`}
            feedback="select"
            scaleTo={0.94}
            onPress={() => onSelect(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${formatDayLabel(d)}${has ? ', food logged' : ''}`}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              gap: 2,
              borderRadius: radius.md,
              backgroundColor: selected ? colors.primary : 'transparent',
              borderWidth: 1,
              borderColor: selected ? colors.primary : isToday ? colors.borderStrong : 'transparent',
            }}>
            <Text variant="caption" color={selected ? 'onPrimary' : 'textTertiary'}>
              {letter}
            </Text>
            <Text variant="bodyStrong" tabular color={selected ? 'onPrimary' : d > t ? 'textSecondary' : 'text'}>
              {fromISODate(d).getDate()}
            </Text>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? (selected ? colors.onPrimary : colors.calories) : 'transparent' }} />
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Calories against budget plus the three macros, in one card. */
export function DaySummaryCard({ day }: { day: DaySummary }) {
  const { colors, spacing } = useTheme();
  const over = day.remaining < 0;
  const p = day.budget > 0 ? day.eaten.kcal / day.budget : 0;
  return (
    <Card testID="diary-summary">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
        <View>
          <Text variant="caption" color="textSecondary">
            {over ? 'Over budget by' : 'Remaining'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numL" tabular color={over ? 'warning' : 'text'} testID="diary-remaining">
              {kcal(Math.abs(day.remaining))}
            </Text>
            <Text variant="label" color="textSecondary">
              kcal
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="caption" color="textSecondary" tabular>
            Eaten <Text variant="label" tabular testID="diary-eaten">{kcal(day.eaten.kcal)}</Text>
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            Budget <Text variant="label" tabular>{kcal(day.budget)}</Text>
            {day.exerciseNet > 0 && day.budget !== day.target ? ` (incl. ${kcal(day.exerciseNet)} exercise)` : ''}
          </Text>
        </View>
      </View>
      <ProgressBar progress={p} color={over ? colors.warning : colors.calories} style={{ marginTop: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg }}>
        {(
          [
            ['Protein', day.eaten.protein, day.macros.proteinG, colors.protein],
            ['Carbs', day.eaten.carbs, day.macros.carbsG, colors.carbs],
            ['Fat', day.eaten.fat, day.macros.fatG, colors.fat],
          ] as const
        ).map(([label, value, target, color]) => (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <MacroStat label={label} value={value} target={target} color={color} />
            <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={5} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function EntryRow({ entry }: { entry: FoodEntry }) {
  const { colors, spacing } = useTheme();
  const ai = entry.source === 'ai' && entry.kcalRange;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <PressableScale
        testID={`entry-${entry.id}`}
        onPress={() => router.push(href('/food/detail', { entryId: entry.id, meal: entry.meal, date: entry.date }) as never)}
        scaleTo={0.985}
        accessibilityLabel={`${entry.name}, ${Math.round(entry.nutrients.kcal)} kilocalories. Edit`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
        <Avatar emoji={entry.emoji ?? '🍽️'} size={38} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {entry.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {entry.grams > 0 && entry.servingLabel !== `${Math.round(entry.grams)} g`
                ? `${portionLabel(entry.servingLabel, entry.quantity)} · ${Math.round(entry.grams)} g`
                : portionLabel(entry.servingLabel, entry.quantity)}
            </Text>
            <SourceTag source={entry.source} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong" tabular>
            {ai ? '~' : ''}
            {kcal(entry.nutrients.kcal)}
          </Text>
          <Text variant="caption" color="textTertiary" tabular>
            {ai ? `${kcal(entry.kcalRange![0])}–${kcal(entry.kcalRange![1])}` : 'kcal'}
          </Text>
        </View>
      </PressableScale>
      <IconButton testID={`entry-delete-${entry.id}`} accessibilityLabel={`Delete ${entry.name}`} tone="clear" size={36} onPress={() => deleteEntry(entry)}>
        <X size={16} color={colors.textTertiary} />
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
  return (
    <Card testID={`meal-card-${meal}`} padding={spacing.lg} style={{ paddingVertical: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 18, lineHeight: 24 }}>{emoji}</Text>
        <Text variant="h3" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {entries.length > 0 ? (
          <Text variant="label" color="textSecondary" tabular testID={`meal-total-${meal}`}>
            {kcal(total)} kcal
          </Text>
        ) : null}
        <IconButton testID={`meal-menu-${meal}`} accessibilityLabel={`${label} options`} tone="clear" size={40} onPress={onMenu}>
          <MoreHorizontal size={20} color={colors.textSecondary} />
        </IconButton>
        <IconButton testID={`meal-add-${meal}`} accessibilityLabel={`Add food to ${label.toLowerCase()}`} tone="alt" size={40} onPress={add}>
          <Plus size={20} color={colors.primary} />
        </IconButton>
      </View>
      {entries.length > 0 ? (
        <View style={{ marginTop: spacing.xs }}>
          {entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider inset={50} /> : null}
              <EntryRow entry={e} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <PressableScale
            testID={`meal-empty-${meal}`}
            onPress={add}
            scaleTo={0.985}
            accessibilityLabel={`Log ${label.toLowerCase()}`}
            style={{
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.borderStrong,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
            <Plus size={16} color={colors.textSecondary} />
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 4 }}>
              <Copy size={16} color={colors.primary} />
              <Text variant="label" color="primary" style={{ flexShrink: 1 }} numberOfLines={1}>
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
      setTargetDate(date === today() ? addDays(date, 1) : today());
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
