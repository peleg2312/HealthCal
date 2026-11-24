import { ChevronDown, ChevronUp, Minus, Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { SourceTag } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { isolateRtl } from '@/lib/bidi';
import { cup, fonts, useTheme } from '@/theme';
import type { Food } from '@/types';
import { Badge, CupKey, IconButton, parseNumber, PressableScale, Text } from '@/ui';

import { confidenceLevel, estimateGrams, gramStep, shownRowName, type ReviewRow } from './estimate';
import { itemFromFood } from './localMatch';

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
    <View testID={id} style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {row.kind === 'fat' ? <CupKey color={colors.fat} /> : null}
        <TextInput
          testID={`${id}-name`}
          value={name}
          onChangeText={onRename}
          accessibilityLabel="Item name"
          selectionColor={colors.primary}
          placeholder="Item name"
          placeholderTextColor={colors.textTertiary}
          style={[
            { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.semibold, fontSize: 15, paddingVertical: 6 },
            { outlineStyle: 'none' } as object,
          ]}
        />
        {unsure && !row.food ? <Badge label="Unsure" color={colors.warning} /> : null}
        <IconButton testID={`${id}-remove`} accessibilityLabel={`Remove ${name}`} size={32} tone="clear" onPress={onRemove}>
          <X size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton
            testID={`${id}-minus`}
            accessibilityLabel={`Less ${name}, minus ${step} grams`}
            size={36}
            tone="surface"
            disabled={item.grams <= step}
            onPress={() => onGrams(Math.max(step, item.grams - step))}>
            <Minus size={16} color={colors.text} />
          </IconButton>
          <GramsInput testID={`${id}-grams`} value={item.grams} onChange={onGrams} label={name} />
          <IconButton testID={`${id}-plus`} accessibilityLabel={`More ${name}, plus ${step} grams`} size={36} tone="surface" onPress={() => onGrams(item.grams + step)}>
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Macro letter="P" value={item.protein} color={colors.protein} />
          <Macro letter="C" value={item.carbs} color={colors.carbs} />
          <Macro letter="F" value={item.fat} color={colors.fat} />
        </View>
      </View>
      {onSwap && !row.food && matches.length > 0 ? (
        <PressableScale
          testID={`${id}-alternatives`}
          onPress={() => setShowAlt((v) => !v)}
          feedback="select"
          accessibilityRole="button"
          accessibilityState={{ expanded: showAlt }}
          accessibilityLabel={`${showAlt ? 'Hide' : 'Show'} ${matches.length} foods from the food list it could be`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginVertical: -8 }}>
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
      accessibilityLabel={`${name}, ${kcal} kcal`}
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

/** One macro of an estimated row, in whole grams ("P 47", never "P 46.5": the estimate is not that precise). */
function Macro({ letter, value, color }: { letter: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <CupKey color={color} size={8} />
      <Text variant="caption" color="textSecondary">
        {letter}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {estimateGrams(value)}
      </Text>
    </View>
  );
}

/** Small grams field that keeps the raw text while typing and commits valid numbers. */
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        minWidth: 72,
        paddingHorizontal: 10,
        ...cup(radius.buttonSm, 5),
        borderWidth: 1.5,
        borderColor: focused ? colors.rim : colors.borderStrong,
        backgroundColor: colors.surface,
      }}>
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
          { width: 40, color: colors.text, fontFamily: fonts.bold, fontSize: 15, textAlign: 'right', paddingVertical: 0, fontVariant: ['tabular-nums'] },
          { outlineStyle: 'none' } as object,
        ]}
      />
      <Text variant="caption" color="textSecondary" style={{ marginLeft: 3 }}>
        g
      </Text>
    </View>
  );
}
