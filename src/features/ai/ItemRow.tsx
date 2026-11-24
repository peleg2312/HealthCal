import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { SourceTag } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { isolateRtl } from '@/lib/bidi';
import { cup, fonts, useTheme } from '@/theme';
import type { Food } from '@/types';
import { Badge, CupKey, IconButton, parseNumber, PressableScale, Text } from '@/ui';

import { confidenceLevel, estimateGrams, gramStep, shownRowName, type ReviewRow } from './estimate';
import { itemFromFood } from './localMatch';
import { alternativesLabel, itemNameLabel, spokenMacros, swapChipLabel } from './words';

/** One editable line of the estimate: name, grams, live calories and macros, remove. */
export function ItemRow({
  row,
  index,
  onGrams,
  onRename,
  onRemove,
  matches = [],
  onSwap,
  onUnswap,
  sample = false,
}: {
  row: ReviewRow;
  index: number;
  /** The fixed sample result: not the AI, so its estimated rows wear the plain dashed key, not the AI's mark. */
  sample?: boolean;
  onGrams: (grams: number) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  /** Database foods this item could be, offered as swap chips. */
  matches?: Food[];
  onSwap?: (food: Food) => void;
  onUnswap?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { item } = row;
  // The reference foods it could be stay folded under one line until asked for; a matched item shows its match.
  const [showAlt, setShowAlt] = useState(false);
  const step = gramStep(item.grams);
  const unsure = row.kind === 'detected' && confidenceLevel(item.confidence) === 'low';
  const id = `ai-item-${index}`;
  // A matched row shows its food's name without the reference list's capitals; typing replaces it as before.
  const name = shownRowName(row);

  return (
    // Every field and button in the row is 44 px tall to touch; the row keeps 8 px above and below them.
    <View testID={id} style={{ paddingVertical: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {row.kind === 'fat' ? <CupKey color={colors.fat} /> : null}
        <TextInput
          testID={`${id}-name`}
          value={name}
          onChangeText={onRename}
          // One name per row (the rows are told apart out of context), starting with the field's own words.
          accessibilityLabel={itemNameLabel(index + 1)}
          selectionColor={colors.primary}
          placeholder="Item name"
          placeholderTextColor={colors.textTertiary}
          style={[
            { flex: 1, minWidth: 0, height: 44, color: colors.text, fontFamily: fonts.semibold, fontSize: 15, paddingVertical: 0 },
            { outlineStyle: 'none' } as object,
          ]}
        />
        {unsure && !row.food ? <Badge label="Unsure" color={colors.warning} /> : null}
        {/* A row's delete is the trash can, as in the diary, Water and Train; an X only closes. */}
        <IconButton testID={`${id}-remove`} accessibilityLabel={`Remove ${name}`} size={32} tone="clear" onPress={onRemove}>
          <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <IconButton
            testID={`${id}-minus`}
            accessibilityLabel={`Less ${name}, minus ${step} grams`}
            size={44}
            tone="surface"
            disabled={item.grams <= step}
            onPress={() => onGrams(Math.max(step, item.grams - step))}>
            <Minus size={16} color={colors.text} />
          </IconButton>
          <GramsInput testID={`${id}-grams`} value={item.grams} onChange={onGrams} label={name} />
          <IconButton testID={`${id}-plus`} accessibilityLabel={`More ${name}, plus ${step} grams`} size={44} tone="surface" onPress={() => onGrams(item.grams + step)}>
            <Plus size={16} color={colors.text} />
          </IconButton>
        </View>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 3 }}>
          <Text variant="numM" tabular testID={`${id}-kcal`} style={{ fontSize: 17, lineHeight: 22 }}>
            {item.kcal}
          </Text>
          <Text variant="unit">kcal</Text>
        </View>
      </View>
      {/* The source on the left, the macros on the right; on a narrow phone the macros wrap under the source rather than run over the stepper. */}
      <View testID={`${id}-source`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.sm, rowGap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
          {/* The sample is not the AI: its unmatched rows say "Sample" beside the plain key, never "AI estimate". */}
          <SourceTag source={row.food ? row.food.source : 'ai'} plain={sample} label={sample && !row.food ? 'Sample' : undefined} />
          {row.food && row.estimate ? (
            <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
              · portion still estimated
            </Text>
          ) : null}
        </View>
        {/* Drawn as "P 47 C 0 F 5", heard in full ("Protein 47 grams, ..."): natively as the group's label, on the web as hidden words beside the hidden letters. */}
        <View
          style={{ flexDirection: 'row', gap: 8 }}
          {...(Platform.OS === 'web' ? {} : { accessible: true, accessibilityLabel: spokenMacros(item.protein, item.carbs, item.fat) })}>
          <View style={{ flexDirection: 'row', gap: 8 }} {...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : {})}>
            <Macro letter="P" value={item.protein} color={colors.protein} />
            <Macro letter="C" value={item.carbs} color={colors.carbs} />
            <Macro letter="F" value={item.fat} color={colors.fat} />
          </View>
          {Platform.OS === 'web' ? <Text style={SPOKEN_ONLY}>{spokenMacros(item.protein, item.carbs, item.fat)}</Text> : null}
        </View>
      </View>
      {onSwap && !row.food && matches.length > 0 ? (
        <PressableScale
          testID={`${id}-alternatives`}
          onPress={() => setShowAlt((v) => !v)}
          feedback="select"
          accessibilityRole="button"
          accessibilityState={{ expanded: showAlt }}
          // react-native-web does not map accessibilityState.expanded: the disclosure says it itself.
          {...({ 'aria-expanded': showAlt } as object)}
          accessibilityLabel={alternativesLabel(matches.length, name)}
          // 44 px tall to touch, drawn in its 20 px line: the area reaches 12 px over the caption above and the row's own padding below.
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginVertical: -12 }}>
          <Text variant="label" color="text">
            {`Could also be (${matches.length})`}
          </Text>
          {showAlt ? <ChevronUp size={16} color={colors.text} strokeWidth={1.9} /> : <ChevronDown size={16} color={colors.text} strokeWidth={1.9} />}
        </PressableScale>
      ) : null}
      {onSwap && (row.food || (showAlt && matches.length > 0)) ? (
        <View style={{ gap: 6 }}>
          {row.food ? (
            <Text variant="caption" color="textSecondary">
              Matched to
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(row.food && !matches.some((m) => m.id === row.food?.id) ? [row.food, ...matches.slice(0, 2)] : matches).map((food, i) => {
              const selected = row.food?.id === food.id;
              const kcal = itemFromFood(food, item.grams, item.confidence).kcal;
              return (
                <SwapChip
                  key={food.id}
                  testID={`${id}-swap-${i}`}
                  name={displayFoodName(food)}
                  kcal={kcal}
                  selected={selected}
                  onPress={() => (selected ? onUnswap?.() : onSwap(food))}
                />
              );
            })}
          </View>
          {row.food && row.estimate ? (
            <Text variant="caption" color="textTertiary">
              Tap the selected food again to go back to the AI estimate.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A food this item could be. Drawn as a chip, but a long reference name ("Chicken thigh, with skin,
 * COOKED (roasted)") takes a second line instead of running past the card, and the calories stay.
 */
function SwapChip({ name, kcal, selected, onPress, testID }: { name: string; kcal: number; selected: boolean; onPress: () => void; testID: string }) {
  const { colors, radius } = useTheme();
  const fg = selected ? 'bg' : 'text';
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityState={{ selected }}
      {...({ 'aria-pressed': selected } as object)}
      accessibilityLabel={swapChipLabel(name, kcal)}
      style={{
        maxWidth: '100%',
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.chip,
        backgroundColor: selected ? colors.text : 'transparent',
        borderWidth: 1,
        borderColor: selected ? colors.text : colors.borderStrong,
      }}>
      <Text variant="label" color={fg} numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 18 }}>
        {isolateRtl(name)}
        <Text variant="label" color={selected ? 'bg' : 'textSecondary'} style={{ fontSize: 13.5 }}>{` · ${kcal}\u00A0kcal`}</Text>
      </Text>
    </PressableScale>
  );
}

/** One macro of an estimated row, in whole grams with its unit ("P 47 g", never "P 46.5": the estimate is not that precise). */
function Macro({ letter, value, color }: { letter: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <CupKey color={color} size={8} />
      <Text variant="caption" color="textSecondary">
        {letter}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {`${estimateGrams(value)} g`}
      </Text>
    </View>
  );
}

/** Hide from sight, keep for screen readers (the web's spoken form of a line drawn in short). */
const SPOKEN_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

/**
 * Small grams field that keeps the raw text while typing and commits valid numbers. The input is the
 * whole 72 x 44 cup (its side room is its own padding, and the "g" is drawn over that padding without
 * taking touches, as the kit's fields do), so a tap anywhere on the cup edits the grams and never
 * lands on the minus or plus beside it.
 */
function GramsInput({ value, onChange, label, testID }: { value: number; onChange: (g: number) => void; label: string; testID: string }) {
  const { colors, radius } = useTheme();
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  const [focused, setFocused] = useState(false);
  if (value !== last) {
    setLast(value);
    if (parseNumber(text) !== value) setText(String(value));
  }
  return (
    <View style={{ width: 72, height: 44 }}>
      <TextInput
        testID={testID}
        value={text}
        inputMode="numeric"
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={`Grams of ${label}`}
        selectionColor={colors.primary}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (parseNumber(text) === null || (parseNumber(text) ?? 0) <= 0) setText(String(value));
        }}
        onChangeText={(t) => {
          setText(t);
          const n = parseNumber(t);
          if (n !== null && n > 0 && n <= 5000) {
            setLast(Math.round(n));
            onChange(n);
          }
        }}
        style={[
          {
            width: 72,
            height: 44,
            ...cup(radius.buttonSm, 5),
            borderWidth: 1.5,
            borderColor: focused ? colors.rim : colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.bold,
            fontSize: 15,
            textAlign: 'right',
            paddingVertical: 0,
            paddingLeft: 8,
            paddingRight: 22,
            fontVariant: ['tabular-nums'],
          },
          { outlineStyle: 'none' } as object,
        ]}
      />
      <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' }}>
        <Text variant="caption" color="textSecondary">
          g
        </Text>
      </View>
    </View>
  );
}
