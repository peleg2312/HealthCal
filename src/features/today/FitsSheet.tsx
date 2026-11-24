import { router } from 'expo-router';
import { Check, Plus, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { mealOnDay } from '@/features/food/addedTo';
import { displayFoodName } from '@/features/food/displayName';
import { approxKcal, approxKcalSpoken, hasEstimate } from '@/features/food/favoriteWords';
import { amountTotal, lastPortions, servingText } from '@/features/food/helpers';
import { logFood, logItems } from '@/features/food/log';
import { customFoodIndex, resolveFood, resolveUsuals, usualFoods } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { today } from '@/lib/dates';
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, CupKey, Divider, EmptyState, IconButton, ProgressBar, SectionTitle, Sheet, Text } from '@/ui';

import { fitCandidates, rankFits, type Fit } from './fits';
import { IDEAS_TITLE, PLATE_NOTE, ideaRow, mealIdeas, overLine, type MealIdea, type MealIdeas } from './ideas';

/** "1 cup" or "1.5 × 1 cup"; `shown` draws a serving label written in Hebrew isolated (display only, never for a screen reader). */
function portionLabel(f: Fit, shown = false): string {
  const q = f.quantity;
  // A serving that is a weight or a volume is said as the total ("100 g", "1000 ml", never "2 × 50 g").
  const total = amountTotal(f.serving.label, q);
  if (total !== null) return total;
  const label = shown ? servingText(f.serving.label) : f.serving.label;
  return q === 1 ? label : `${Number.isInteger(q) ? q : q.toFixed(1)} × ${label}`;
}

const SOURCE_LABEL: Record<Fit['from'], string> = { usual: 'Usual', favourite: 'Favourite', recent: 'Recent' };
/** Every idea's bar is this wide, so two rows' shares can be compared by eye. */
const FIT_BAR_W = 64;

/**
 * The meals that fit what is left of `date` now, for `meal` (`mealIdeas`, @/features/today/ideas), from
 * this phone's diary and saved meals. For a screen that says them as text (the coach's "Ideas for
 * dinner"); its button opens What fits with `<FitsSheet />`, which shows the same list.
 */
export function useMealIdeas(date: ISODate, meal: MealType, proteinGap = false): MealIdeas {
  const todayDate = useToday();
  const day = useDay(date);
  const entries = useLive('foodEntries');
  const savedMeals = useLive('savedMeals');
  return mealIdeas({ entries, savedMeals, meal, date, today: todayDate, kcalLeft: day.remaining, proteinGap });
}

/**
 * "What fits": first up to three meals that fit (the person's own meals and saved meals, else fixed
 * plates; `mealIdeas`), each with a thin bar directly under its kcal figure for its share of what is
 * left (`fits-idea-bar-<i>`) and logged in one tap with one Undo, then up to eight of the person's own
 * foods that fit in the calories left, each one tap from the diary. Opened from Today's "Ideas that
 * fit" chip and the calories-left number, and from the coach's protein tip (ranked by protein per kcal).
 * Over the budget it shows one neutral line and "Search all foods", never a list.
 */
export function FitsSheet({
  visible,
  onClose,
  date,
  meal,
  kcalLeft,
  proteinFirst,
  proteinLeft,
}: {
  visible: boolean;
  onClose: () => void;
  date: ISODate;
  meal: MealType;
  kcalLeft: number;
  proteinFirst: boolean;
  proteinLeft: number;
}) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const todayDate = useToday();
  const entries = useLive('foodEntries');
  const savedMeals = useLive('savedMeals');
  const favourites = useLive('favorites');
  const recents = useStore((s) => s.recentFoods);
  const customFoods = useLive('customFoods');
  // What was added while the sheet is open (a food or a meal, with the entries it wrote); cleared when it closes.
  // An add whose entries were undone counts no more, so its row offers the add again.
  const [added, setAdded] = useState<{ key: string; kcal: number; ids: string[] }[]>([]);

  const close = () => {
    setAdded([]);
    onClose();
  };

  const liveIds = new Set(entries.map((e) => e.id));
  const stillAdded = added.filter((a) => a.ids.some((id) => liveIds.has(id)));
  const isAdded = (key: string) => stillAdded.some((a) => a.key === key);
  // While the sheet is open, rank against the budget it opened with, so no row moves or vanishes when one is added.
  const budget = kcalLeft + stillAdded.reduce((s, a) => s + a.kcal, 0);
  const customById = customFoodIndex(customFoods);
  const candidates = fitCandidates({
    // Own foods as they are now: an edited one uses today's values, a deleted one is left out.
    usual: resolveUsuals(usualFoods(entries, meal, todayDate, { limit: 8, withFood: true }), customById).map((u) => u.last),
    favourites: favourites.map((f) => resolveFood(f.food, customById)).filter((f) => f !== null),
    recents: recents.map((f) => resolveFood(f, customById)).filter((f) => f !== null),
    lastByFood: lastPortions(entries),
  });
  const ideas = mealIdeas({ entries, savedMeals, meal, date, today: todayDate, kcalLeft: budget, proteinGap: proteinFirst });
  const over = ideas.state === 'over';
  const fits = over ? [] : rankFits(candidates, { kcalLeft: budget, proteinFirst });
  const mealName = MEAL_LABEL[meal].toLowerCase();
  const left = formatNumber(Math.max(0, Math.round(budget)));
  const hasIdeas = ideas.ideas.length > 0;

  const search = () => {
    close();
    setTimeout(() => router.push(`/food/search?meal=${meal}&date=${date}` as never), 60);
  };

  const add = (f: Fit) => {
    // The serving the row priced (`fitCandidates` resolves the remembered portion), so what is added is what was shown.
    const entry = logFood({ food: f.food, serving: f.serving, quantity: f.quantity, meal, date });
    setAdded((a) => [...a, { key: f.key, kcal: f.kcal, ids: [entry.id] }]);
  };

  const addIdea = (idea: MealIdea) => {
    // One Undo for the whole meal; the day in the toast is read now, in the handler.
    // A past meal's name ends in the meal ("Yesterday's dinner"), so its toast does not say the meal twice.
    const where = mealOnDay(meal, date, today());
    const written = logItems(idea.items, meal, date, idea.kind === 'past' ? `Added to ${where}` : `${isolateRtl(idea.name)} added to ${where}`);
    if (written.length) setAdded((a) => [...a, { key: `idea:${idea.key}`, kcal: idea.kcal, ids: written.map((e) => e.id) }]);
  };

  // An idea whose items carry a range (a saved or past AI estimate) never shows an exact number: "~473".
  const kcalFigure = (kcal: number, size: number, estimate = false) => (
    <Text variant="numM" style={{ fontSize: size, lineHeight: size + 5 }}>
      {approxKcal(kcal, estimate)}
      <Text variant="unit">{' kcal'}</Text>
    </Text>
  );
  const proteinLine = (protein: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <CupKey color={colors.protein} size={8} />
      <Text variant="caption" color="textSecondary">
        {`${Math.round(protein)} g protein`}
      </Text>
    </View>
  );
  const numbers = (kcal: number, protein: number, size: number) => (
    <>
      {kcalFigure(kcal, size)}
      {proteinLine(protein)}
    </>
  );

  // The share of what is left that a meal takes, as one thin bar directly under its kcal figure, in that
  // figure's own column and on its side (right in the numbers column, left on a narrow phone), with the protein
  // line after it: the bar belongs to the kcal, never to the protein. Its track is every progress bar's `track`.
  // Against the budget the sheet opened with (the figure its first line prints), so a bar never moves while the
  // sheet is open. A row that no longer fits draws none, so no amber appears in a list of suggestions.
  // The margins are the bar's own room: its tick stands 4 px proud above and below.
  const fitBar = (idea: MealIdea, i: number, bottom: number) => (
    <View testID={`fits-idea-bar-${i}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: FIT_BAR_W, marginTop: 2, marginBottom: bottom }}>
      <ProgressBar progress={budget > 0 ? idea.kcal / budget : 0} color={colors.calories} height={4} memoryKey={`fit-${idea.key}`} />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="What fits"
      footer={
        fits.length || hasIdeas || over ? (
          <Button testID="fits-search" title="Search all foods" variant="secondary" icon={<Search size={18} color={colors.text} />} onPress={search} />
        ) : undefined
      }>
      {over ? (
        <Text variant="body" color="textSecondary" testID="fits-over">
          {overLine(ideas.overBy, date === todayDate)}
        </Text>
      ) : (
        <Text variant="body" color="textSecondary" testID="fits-intro">
          {proteinFirst
            ? `Your foods with the most protein for their calories, within ${left} kcal left. ${Math.max(0, Math.round(proteinLeft))} g of protein to go.`
            : hasIdeas
              ? `Meals and foods that fit in ${left} kcal left.`
              : `Your foods that fit in ${left} kcal left.`}{' '}
          {`Adds to ${mealName}.`}
        </Text>
      )}
      {hasIdeas ? (
        <View testID="fits-ideas">
          <SectionTitle title={IDEAS_TITLE} testID="fits-ideas-title" />
          {ideas.state === 'ideas' && ideas.plates ? (
            <Text variant="caption" color="textSecondary" testID="fits-ideas-note" style={{ marginBottom: 4 }}>
              {PLATE_NOTE}
            </Text>
          ) : null}
          {ideas.ideas.map((idea, i) => {
            const row = ideaRow(idea.kcal, isAdded(`idea:${idea.key}`), kcalLeft);
            const dim = row.kind === 'dim';
            return (
              <React.Fragment key={idea.key}>
                {i > 0 ? <Divider inset={34} /> : null}
                <View testID={`fits-idea-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 17, lineHeight: 22, width: 22, textAlign: 'center', opacity: dim ? 0.6 : 1 }}>{idea.emoji || '🍽️'}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" color={dim ? 'textSecondary' : 'text'} numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                      {idea.name}
                    </Text>
                    {narrow ? (
                      // A narrow phone has no room for a numbers column: they lead the line under the name, the bar
                      // under the kcal figure in the figure's own column and the protein beside the figure, on its line.
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', columnGap: 8 }}>
                        <View>
                          {kcalFigure(idea.kcal, 15, hasEstimate(idea.items))}
                          {dim ? null : fitBar(idea, i, 4)}
                        </View>
                        <View style={{ minHeight: 20, justifyContent: 'center' }}>{proteinLine(idea.protein)}</View>
                      </View>
                    ) : null}
                    <Text variant="caption" color="textSecondary" numberOfLines={2} testID={`fits-idea-foods-${i}`}>
                      {/* The foods drawn without the reference list's capitals (`idea.foods` are the items' stored names). */}
                      {idea.items.map((it) => isolateRtl(displayFoodName(it))).join(' · ')}
                    </Text>
                    {dim ? (
                      <Text variant="caption" color="textSecondary" testID={`fits-idea-more-${i}`} style={{ marginTop: 2 }}>
                        {row.caption}
                      </Text>
                    ) : null}
                  </View>
                  {narrow ? null : (
                    // The numbers column: the kcal figure, its bar, then the protein line.
                    <View style={{ alignItems: 'flex-end' }}>
                      {kcalFigure(idea.kcal, 17, hasEstimate(idea.items))}
                      {dim ? null : fitBar(idea, i, 8)}
                      {proteinLine(idea.protein)}
                    </View>
                  )}
                  <IconButton
                    testID={`fits-idea-add-${i}`}
                    accessibilityLabel={
                      row.kind === 'added'
                        ? `${idea.name} added`
                        : `Add ${idea.name}: ${idea.items.map(displayFoodName).join('; ')}, ${approxKcalSpoken(idea.kcal, hasEstimate(idea.items))}, to ${mealName}${dim ? `. ${row.caption}` : ''}`
                    }
                    tone={row.kind === 'added' ? 'primary' : 'surface'}
                    size={44}
                    disabled={row.kind === 'added'}
                    onPress={() => addIdea(idea)}>
                    {row.kind === 'added' ? <Check size={20} color={colors.onPrimary} strokeWidth={2.6} /> : <Plus size={20} color={colors.text} strokeWidth={2.2} />}
                  </IconButton>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      ) : null}
      {hasIdeas && fits.length ? <SectionTitle title="Your foods" testID="fits-foods-title" /> : null}
      {over || (fits.length === 0 && hasIdeas) ? null : fits.length === 0 ? (
        <View testID="fits-empty">
          <EmptyState
            emoji={budget > 0 ? '🔎' : '🧭'}
            title={candidates.length === 0 ? 'No food history yet' : budget > 0 ? 'Nothing you usually eat fits' : date === todayDate ? 'No calories left today' : 'No calories left that day'}
            message={
              candidates.length === 0
                ? 'Foods you log, star or eat often show up here, sized to what you have left.'
                : budget > 0
                  ? `None of your recent or favourite foods fits in ${left} kcal at the portion you usually have.`
                  : 'Your budget for the day is used. Search if you want to log something anyway.'
            }
            action="Search foods"
            onAction={search}
          />
        </View>
      ) : (
        <View testID="fits-list">
          {fits.map((f, i) => {
            const row = ideaRow(f.kcal, isAdded(f.key), kcalLeft);
            const dim = row.kind === 'dim';
            return (
              <React.Fragment key={f.key}>
                {i > 0 ? <Divider inset={34} /> : null}
                <View testID={`fits-row-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 8 }}>
                  {/* Emoji are content marks only: 17 px, no tile. */}
                  <Text style={{ fontSize: 17, lineHeight: 22, width: 22, textAlign: 'center', opacity: dim ? 0.6 : 1 }}>{f.food.emoji || '🍽️'}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" color={dim ? 'textSecondary' : 'text'} numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                      {isolateRtl(displayFoodName(f.food))}
                    </Text>
                    {/* A narrow phone has no room for a numbers column: they lead the line under the name. */}
                    {narrow ? <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>{numbers(f.kcal, f.protein, 15)}</View> : null}
                    <Text variant="caption" color="textSecondary" numberOfLines={2}>
                      {`${portionLabel(f, true)} · ${SOURCE_LABEL[f.from]}`}
                    </Text>
                    {dim ? (
                      <Text variant="caption" color="textSecondary" testID={`fits-more-${i}`} style={{ marginTop: 2 }}>
                        {row.caption}
                      </Text>
                    ) : null}
                  </View>
                  {narrow ? null : <View style={{ alignItems: 'flex-end' }}>{numbers(f.kcal, f.protein, 17)}</View>}
                  <IconButton
                    testID={`fits-add-${i}`}
                    accessibilityLabel={row.kind === 'added' ? `${displayFoodName(f.food)} added` : `Add ${displayFoodName(f.food)}, ${portionLabel(f)}, ${Math.round(f.kcal)} kilocalories, to ${mealName}`}
                    tone={row.kind === 'added' ? 'primary' : 'surface'}
                    size={44}
                    disabled={row.kind === 'added'}
                    onPress={() => add(f)}>
                    {row.kind === 'added' ? <Check size={20} color={colors.onPrimary} strokeWidth={2.6} /> : <Plus size={20} color={colors.text} strokeWidth={2.2} />}
                  </IconButton>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
