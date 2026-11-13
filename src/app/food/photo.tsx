import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Droplet, FlaskConical, ImagePlus, Info, Lightbulb, MessageSquareText, RefreshCw, Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { AddMissingItem } from '@/features/ai/AddMissingItem';
import { AiError, aiError, type AiErrorCode } from '@/features/ai/api';
import { AnalysingView } from '@/features/ai/AnalysingView';
import { availability, DEMO_ERROR_CODES } from '@/features/ai/demo';
import { ErrorView, type ErrorAction, type ScreenErrorCode } from '@/features/ai/ErrorView';
import {
  ADDED_FAT_OPTIONS,
  applyAddedFat,
  calorieRange,
  CONFIDENCE_WORDS,
  confidenceLevel,
  formatKcalRange,
  makeRow,
  overallConfidence,
  renameRow,
  rowsFromResult,
  rowsToLogItems,
  setRowGrams,
  swapRow,
  totals,
  unswapRow,
  withCorrection,
  type AddedFat,
  type ReviewRow,
} from '@/features/ai/estimate';
import { ItemRow } from '@/features/ai/ItemRow';
import { matchFoods } from '@/features/ai/localMatch';
import { PhotoHero } from '@/features/ai/PhotoHero';
import { SampleNotice } from '@/features/ai/SampleNotice';
import { logItems } from '@/features/food/log';
import { BUILTIN_FOODS } from '@/data/foods';
import { today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMacro, mealForTime, MEALS } from '@/lib/nutrition';
import { useAuth } from '@/services/auth';
import { analyzeFood, PhotoError, pickPhoto, prepareImage, takePendingPhoto, type PickedPhoto, type PreparedImage } from '@/services/aiFood';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { AiFoodResult, Food, MealType } from '@/types';
import { Button, Card, Chip, Divider, goBack, haptic, Header, MacroBar, Screen, Segmented, Text, TextField, toast } from '@/ui';

type InputMode = 'photo' | 'text';
type Step = 'capture' | 'analysing' | 'review' | 'error';
interface ScreenError {
  code: ScreenErrorCode;
  message: string;
  retryable: boolean;
  /** The failed attempt was the careful pass over an existing result. */
  precise: boolean;
}

const isMeal = (v: unknown): v is MealType => MEALS.some((m) => m.id === v);
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

export default function PhotoScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; mode?: string; demoError?: string }>();
  const { colors, radius, spacing } = useTheme();
  const session = useAuth((s) => s.session);
  const access = availability(isBackendConfigured, !!session);
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();
  const demoError = __DEV__ && DEMO_ERROR_CODES.includes(params.demoError as AiErrorCode) ? (params.demoError as AiErrorCode) : undefined;

  const [mode, setMode] = useState<InputMode>(params.mode === 'text' ? 'text' : 'photo');
  const [step, setStep] = useState<Step>('capture');
  const [meal, setMeal] = useState<MealType>(isMeal(params.meal) ? params.meal : mealForTime());
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [preview, setPreview] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<AiFoodResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fat, setFat] = useState<AddedFat>('none');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [precisePass, setPrecisePass] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [addingAi, setAddingAi] = useState(false);
  const [pendingPrecise, setPendingPrecise] = useState(false);
  const [correction, setCorrection] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // Where the item rows sit in the scroll content, so a hero pill can scroll to one.
  const layout = useRef<{ section: number; card: number; rows: Record<string, number> }>({ section: 0, card: 0, rows: {} });
  const customFoods = useLive('customFoods');
  // The person's own foods first, then the bundled reference foods.
  const matchPool: Food[] = [...customFoods, ...BUILTIN_FOODS];

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 1600);
    return () => clearTimeout(t);
  }, [highlight]);

  const searchHref = `/food/search?meal=${meal}&date=${date}`;
  const ready = mode === 'photo' ? !!preview : description.trim().length >= 3;

  const fail = (e: unknown, precise: boolean) => {
    haptic.warn();
    if (e instanceof AiError) {
      if (e.remaining !== null) setRemaining(e.remaining);
      setError({ code: e.code, message: e.message, retryable: e.retryable, precise });
    } else if (e instanceof PhotoError) {
      setError({ code: e.code, message: e.message, retryable: false, precise });
    } else {
      const u = aiError('unknown');
      setError({ code: u.code, message: u.message, retryable: true, precise });
    }
    setStep('error');
  };

  async function choose(source: 'camera' | 'library') {
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      await acceptPhoto(picked);
    } catch (e) {
      setPhoto(null);
      fail(e, false);
    }
  }

  async function acceptPhoto(picked: PickedPhoto) {
    try {
      setMode('photo');
      setPreparing(true);
      setPhoto(picked);
      setPreview(null);
      const prepared = await prepareImage(picked);
      setPreview(prepared);
    } catch (e) {
      setPhoto(null);
      fail(e, false);
    } finally {
      setPreparing(false);
    }
  }

  // Android can kill the app while the camera app is open; collect that photo on return.
  useEffect(() => {
    let live = true;
    void takePendingPhoto().then((picked) => {
      if (live && picked) void acceptPhoto(picked);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyse(precise: boolean, fix?: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPendingPrecise(precise);
    setStep('analysing');
    try {
      let image: string | undefined;
      if (mode === 'photo' && photo && preview) {
        // The careful pass gets more pixels: 1024 px instead of 768 px.
        image = precise ? (await prepareImage(photo, { precise: true })).base64 : preview.base64;
      }
      const base = mode === 'photo' ? note.trim() || undefined : description.trim();
      const text = fix?.trim() ? withCorrection(base, fix) : base;
      const res = await analyzeFood({ image, text, precise }, { signal: controller.signal, demoError });
      if (controller.signal.aborted) return;
      setResult(res.result);
      if (res.remaining !== null) setRemaining(res.remaining);
      // A new pass replaces what the model found; items the user added stay.
      const kept = rows.filter((r) => r.kind === 'added');
      setRows(applyAddedFat([...rowsFromResult(res.result), ...kept], fat));
      setPrecisePass(precise || (!!fix && precisePass));
      if (fix) setCorrection('');
      setError(null);
      setStep('review');
      haptic.success();
    } catch (e) {
      if (isAbort(e) || controller.signal.aborted) return;
      fail(e, precise);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep(result ? 'review' : 'capture');
  }

  async function askAiForItem(text: string): Promise<boolean> {
    setAddingAi(true);
    try {
      const res = await analyzeFood({ text });
      if (res.remaining !== null) setRemaining(res.remaining);
      setRows((rs) => [...rs.filter((r) => r.kind !== 'fat'), ...res.result.items.map((it) => makeRow(it, 'added')), ...rs.filter((r) => r.kind === 'fat')]);
      haptic.success();
      return true;
    } catch (e) {
      toast(e instanceof AiError ? e.message : 'Could not estimate that item. Try again.');
      return false;
    } finally {
      setAddingAi(false);
    }
  }

  function chooseFat(v: AddedFat) {
    setFat(v);
    setRows((rs) => applyAddedFat(rs, v));
  }

  function add() {
    const items = rowsToLogItems(rows, newId);
    if (items.length === 0) return;
    logItems(items, meal, date);
    // Estimates and matched foods show up in Recent, ready to log again.
    const store = useStore.getState();
    for (const it of items) if (it.food) store.rememberFood(it.food);
    goBack(`/diary?date=${date}`);
  }

  function removeRow(r: ReviewRow) {
    const index = rows.findIndex((x) => x.key === r.key);
    const fatBefore = fat;
    if (r.kind === 'fat') setFat('none');
    setRows((rs) => rs.filter((x) => x.key !== r.key));
    toast(`Removed ${r.item.name.trim() || 'item'}`, {
      label: 'Undo',
      onPress: () => {
        if (r.kind === 'fat') {
          // Put the chosen amount back the same way the chips set it.
          setFat(fatBefore);
          setRows((rs) => applyAddedFat(rs, fatBefore));
          return;
        }
        setRows((rs) => (rs.some((x) => x.key === r.key) ? rs : [...rs.slice(0, index), r, ...rs.slice(index)]));
      },
    });
  }

  /** Swap chips for estimated items, not for the fat amount or a food the person already picked. */
  function swappable(r: ReviewRow): boolean {
    return r.kind !== 'fat' && !(r.food && !r.estimate);
  }

  function showRow(key: string) {
    const y = layout.current.rows[key];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, layout.current.section + layout.current.card + y - 12), animated: true });
    setHighlight(key);
  }

  function switchMode(m: InputMode) {
    setMode(m);
    setError(null);
    setStep('capture');
  }

  // ---------------------------------------------------------------- render

  const title = step === 'review' || (result && (step === 'analysing' || error?.precise)) ? 'Review estimate' : mode === 'photo' ? 'Snap a meal' : 'Describe a meal';
  const items = rows.map((r) => r.item);
  const sum = totals(items);
  const range = calorieRange(items);
  const conf = confidenceLevel(overallConfidence(rows.filter((r) => r.kind === 'detected').map((r) => r.item)));
  const isDemo = !!result?.demo;
  // The sample result is not about the photo, so it does not wear it.
  const heroPhoto = mode === 'photo' && preview && !isDemo ? preview.uri : null;
  const allowance = remaining !== null ? `${remaining} ${remaining === 1 ? 'analysis' : 'analyses'} left today` : null;

  let footer: React.ReactNode = null;
  if (step === 'capture' && (mode === 'text' || preview || preparing)) {
    footer = (
      <Button
        testID="ai-analyse"
        title="Estimate nutrition"
        icon={<Sparkles size={18} color={colors.onPrimary} />}
        disabled={!ready}
        loading={preparing}
        onPress={() => void analyse(false)}
      />
    );
  } else if (step === 'analysing') {
    footer = <Button testID="ai-cancel" title="Cancel" variant="secondary" onPress={cancel} />;
  } else if (step === 'review') {
    footer = (
      <Button
        testID="ai-add-to-diary"
        title={`${isDemo ? 'Add sample to' : 'Add to'} ${MEALS.find((m) => m.id === meal)?.label.toLowerCase()} · ${sum.kcal} kcal`}
        disabled={items.length === 0}
        onPress={add}
      />
    );
  }

  return (
    <Screen
      header={<Header title={title} subtitle={step === 'review' ? undefined : 'AI estimate'} close onBack={() => goBack(`/diary?date=${date}`)} />}
      footer={footer}
      scrollProps={{ ref: scrollRef } as ScrollViewProps}>
      {step === 'capture' ? (
        <>
          <Segmented
            options={[
              { value: 'photo', label: 'Photo' },
              { value: 'text', label: 'Describe' },
            ]}
            value={mode}
            onChange={switchMode}
          />
          {!access.live ? <SampleNotice reason={access.reason} variant="before" /> : null}
          {mode === 'photo' ? (
            <>
              {photo ? (
                <View style={{ gap: spacing.md }}>
                  <View
                    style={{
                      width: '100%',
                      aspectRatio: preview ? Math.max(0.75, Math.min(1.6, preview.width / Math.max(1, preview.height))) : 1.33,
                      maxHeight: 340,
                      borderRadius: radius.lg,
                      overflow: 'hidden',
                      backgroundColor: colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {preview ? (
                      <Image testID="ai-photo-preview" source={{ uri: preview.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Your meal photo" />
                    ) : (
                      <Text variant="label" color="textSecondary">
                        Preparing photo…
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button testID="ai-retake" title="Retake" variant="secondary" size="sm" full={false} style={{ flex: 1 }} icon={<Camera size={16} color={colors.text} />} onPress={() => void choose('camera')} />
                    <Button testID="ai-repick" title="Choose another" variant="secondary" size="sm" full={false} style={{ flex: 1 }} icon={<ImagePlus size={16} color={colors.text} />} onPress={() => void choose('library')} />
                  </View>
                </View>
              ) : (
                <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.fat}22`, alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={28} color={colors.fat} />
                  </View>
                  <Text variant="h3" align="center">
                    Photograph your meal
                  </Text>
                  <Text variant="body" color="textSecondary" align="center">
                    You get a list of foods with portions you can correct before anything is added.
                  </Text>
                  <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xs }}>
                    <Button testID="ai-take-photo" title="Take photo" icon={<Camera size={18} color={colors.onPrimary} />} onPress={() => void choose('camera')} />
                    <Button testID="ai-choose-photo" title="Choose from library" variant="secondary" icon={<ImagePlus size={18} color={colors.text} />} onPress={() => void choose('library')} />
                  </View>
                </Card>
              )}
              <TextField
                testID="ai-photo-note"
                label="Anything the photo can't show? (optional)"
                placeholder="e.g. cooked in butter, large plate"
                value={note}
                onChangeText={setNote}
                maxLength={200}
              />
              {!photo ? <PhotoTips /> : null}
            </>
          ) : (
            <>
              <TextField
                testID="ai-description"
                label="What did you eat?"
                placeholder="e.g. Two scrambled eggs with butter, one slice of sourdough toast and a flat white"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                autoFocus
                style={{ minHeight: 120 }}
                hint="Amounts and how it was cooked make the estimate more accurate."
              />
            </>
          )}
        </>
      ) : null}

      {step === 'analysing' ? (
        <AnalysingView
          photoUri={mode === 'photo' ? preview?.uri : undefined}
          aspect={preview ? preview.width / Math.max(1, preview.height) : undefined}
          description={mode === 'text' ? description.trim() : undefined}
          precise={pendingPrecise}
        />
      ) : null}

      {step === 'error' && error ? (
        <>
          <ErrorView code={error.code} message={error.message} actions={errorActions()} footnote={error.code === 'daily_limit' ? undefined : (allowance ?? undefined)} />
        </>
      ) : null}

      {step === 'review' && result ? (
        <>
          {isDemo ? <SampleNotice reason={access.live ? 'signed_out' : access.reason} variant="result" /> : null}

          {heroPhoto ? (
            <>
              <PhotoHero
                uri={heroPhoto}
                dish={result.dish}
                kcal={sum.kcal}
                range={`${formatKcalRange(range)} kcal`}
                items={rows.filter((r) => r.kind !== 'fat').map((r) => ({ key: r.key, item: r.item }))}
                onItemPress={showRow}
              />
              <Card style={{ gap: spacing.md }}>
                <Text variant="caption" color="textSecondary">
                  {`AI estimate · ${CONFIDENCE_WORDS[conf]}${precisePass ? ' · checked carefully' : ''}`}
                </Text>
                <MacroBar protein={sum.protein} carbs={sum.carbs} fat={sum.fat} />
                <View style={{ flexDirection: 'row' }}>
                  <MacroStat label="Protein" value={sum.protein} color={colors.protein} />
                  <MacroStat label="Carbs" value={sum.carbs} color={colors.carbs} />
                  <MacroStat label="Fat" value={sum.fat} color={colors.fat} />
                </View>
              </Card>
            </>
          ) : (
            <Card style={{ gap: spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: `${isDemo ? colors.warning : colors.primary}22`, alignItems: 'center', justifyContent: 'center' }}>
                  {isDemo ? <FlaskConical size={24} color={colors.warning} /> : <Sparkles size={24} color={colors.primary} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="h3" numberOfLines={2} testID="ai-dish">
                    {isDemo ? `Sample: ${result.dish}` : result.dish}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {isDemo ? 'Example data' : `AI estimate · ${CONFIDENCE_WORDS[conf]}${precisePass ? ' · checked carefully' : ''}`}
                  </Text>
                </View>
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text variant="numXL" tabular testID="ai-total-kcal">
                    {sum.kcal}
                  </Text>
                  <Text variant="title" color="textSecondary">
                    kcal
                  </Text>
                </View>
                <Text variant="label" color="textSecondary" testID="ai-total-range">
                  {formatKcalRange(range)} kcal
                </Text>
              </View>
              <MacroBar protein={sum.protein} carbs={sum.carbs} fat={sum.fat} />
              <View style={{ flexDirection: 'row' }}>
                <MacroStat label="Protein" value={sum.protein} color={colors.protein} />
                <MacroStat label="Carbs" value={sum.carbs} color={colors.carbs} />
                <MacroStat label="Fat" value={sum.fat} color={colors.fat} />
              </View>
            </Card>
          )}

          <Card style={{ gap: spacing.md, borderColor: result.hiddenFatQuestion ? `${colors.fat}66` : colors.border }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <Droplet size={18} color={colors.fat} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title">{result.hiddenFatQuestion ?? 'Cooked or dressed with fat?'}</Text>
                <Text variant="caption" color="textSecondary">
                  Oil, butter and dressing rarely show in a photo and are the most common thing estimates miss. 1 tsp is about 40 kcal.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {ADDED_FAT_OPTIONS.map((o) => (
                <Chip key={o.value} testID={`ai-fat-${o.value}`} label={o.label} selected={fat === o.value} onPress={() => chooseFat(o.value)} />
              ))}
            </View>
          </Card>

          <View style={{ gap: spacing.sm }} onLayout={(e) => (layout.current.section = e.nativeEvent.layout.y)}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text variant="h3">Items</Text>
              <Text variant="caption" color="textSecondary">
                Tap a name or weight to correct it
              </Text>
            </View>
            <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} onLayout={(e) => (layout.current.card = e.nativeEvent.layout.y)}>
              {rows.length === 0 ? (
                <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.lg }}>
                  No items left. Add what you ate below, or go back and try again.
                </Text>
              ) : (
                rows.map((r, i) => (
                  <View
                    key={r.key}
                    onLayout={(e) => (layout.current.rows[r.key] = e.nativeEvent.layout.y)}
                    style={{
                      marginHorizontal: -spacing.md,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: highlight === r.key ? colors.primarySoft : 'transparent',
                    }}>
                    {i > 0 ? <Divider /> : null}
                    <ItemRow
                      row={r}
                      index={i}
                      matches={swappable(r) ? matchFoods(r.estimate?.name ?? r.item.name, matchPool, 3) : []}
                      onSwap={!swappable(r) ? undefined : (food) => setRows((rs) => rs.map((x) => (x.key === r.key ? swapRow(x, food) : x)))}
                      onUnswap={() => setRows((rs) => rs.map((x) => (x.key === r.key ? unswapRow(x) : x)))}
                      onGrams={(g) => setRows((rs) => rs.map((x) => (x.key === r.key ? setRowGrams(x, g) : x)))}
                      onRename={(name) => setRows((rs) => rs.map((x) => (x.key === r.key ? renameRow(x, name) : x)))}
                      onRemove={() => removeRow(r)}
                    />
                  </View>
                ))
              )}
            </Card>
            <AddMissingItem
              foods={matchPool}
              onAdd={(item, food) => setRows((rs) => [...rs.filter((r) => r.kind !== 'fat'), makeRow(item, 'added', food), ...rs.filter((r) => r.kind === 'fat')])}
              onAskAi={access.live ? askAiForItem : undefined}
              aiBusy={addingAi}
            />
          </View>

          {result.note ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }} testID="ai-note">
              <Info size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {result.note}
              </Text>
            </View>
          ) : null}

          <Card style={{ gap: spacing.md }} testID="ai-correction">
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <MessageSquareText size={18} color={colors.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title">What did it get wrong?</Text>
                <Text variant="caption" color="textSecondary">
                  {`Say it in a few words and the ${mode === 'photo' ? 'photo' : 'description'} is estimated again with your correction. Uses one analysis; items you added stay.`}
                </Text>
              </View>
            </View>
            <TextField
              testID="ai-correction-input"
              placeholder="e.g. it's cauliflower rice, and no cheese"
              value={correction}
              onChangeText={setCorrection}
              maxLength={300}
              accessibilityLabel="What the estimate got wrong"
              returnKeyType="send"
              onSubmitEditing={() => correction.trim().length >= 3 && void analyse(precisePass, correction)}
            />
            <Button
              testID="ai-reestimate"
              title="Re-estimate"
              variant="secondary"
              size="md"
              disabled={correction.trim().length < 3}
              icon={<RefreshCw size={16} color={colors.text} />}
              onPress={() => void analyse(precisePass, correction)}
            />
          </Card>

          <View style={{ gap: spacing.sm }}>
            <Text variant="h3">Meal</Text>
            <Segmented options={MEALS.map((m) => ({ value: m.id, label: m.label }))} value={meal} onChange={setMeal} />
          </View>

          <Card tone="alt" style={{ gap: spacing.sm }}>
            <Text variant="title">{precisePass ? 'Checked with the stronger model' : 'Not quite right?'}</Text>
            <Text variant="caption" color="textSecondary">
              {precisePass
                ? 'This estimate already used the careful check. Correct the items above if something is still off.'
                : `Check again more carefully with a stronger model${mode === 'photo' ? ' and a sharper copy of the photo' : ''}. It counts as another analysis and replaces the items found, keeping the ones you added.`}
            </Text>
            {!precisePass ? (
              <Button
                testID="ai-check-again"
                title="Check again more carefully"
                variant="secondary"
                size="md"
                icon={<RefreshCw size={16} color={colors.text} />}
                onPress={() => void analyse(true)}
              />
            ) : null}
            {allowance ? (
              <Text variant="caption" color="textTertiary" testID="ai-remaining">
                {allowance}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );

  function errorActions(): ErrorAction[] {
    if (!error) return [];
    const out: ErrorAction[] = [];
    const back = () => {
      setError(null);
      setStep('capture');
    };
    if (error.precise && result) {
      out.push({ id: 'back-to-estimate', label: 'Back to the first estimate', onPress: () => setStep('review') });
    }
    switch (error.code) {
      case 'unauthorized':
        out.push({ id: 'sign-in', label: 'Sign in', onPress: () => router.push('/auth?mode=signin' as never) });
        break;
      case 'daily_limit':
        out.push({ id: 'search', label: 'Search food instead', onPress: () => router.replace(searchHref as never) });
        out.push({ id: 'quick', label: 'Enter calories yourself', onPress: () => router.replace(`/food/quick?meal=${meal}&date=${date}` as never) });
        return out;
      case 'camera_denied':
        out.push({ id: 'library', label: 'Choose from library', onPress: () => void choose('library') });
        break;
      case 'not_food':
      case 'declined':
      case 'bad_request':
      case 'unreadable':
      case 'truncated':
        if (mode === 'photo') out.push({ id: 'another-photo', label: 'Try another photo', onPress: back });
        break;
      default:
        if (error.retryable) out.push({ id: 'retry', label: 'Try again', onPress: () => void analyse(error.precise) });
    }
    if (mode === 'photo') {
      out.push({
        id: 'describe',
        label: 'Describe it in words instead',
        onPress: () => {
          if (note.trim() && !description.trim()) setDescription(note.trim());
          switchMode('text');
        },
      });
    } else if (error.code !== 'unauthorized') {
      out.push({ id: 'edit', label: 'Edit the description', onPress: back });
    }
    out.push({ id: 'search', label: 'Search food manually', onPress: () => router.replace(searchHref as never) });
    return out;
  }
}

function MacroStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </View>
      <Text variant="title" tabular>
        {formatMacro(value)} g
      </Text>
    </View>
  );
}

function PhotoTips() {
  const { colors, spacing } = useTheme();
  const tips = ['The whole plate in frame, shot from above', 'Good light, no strong shadows', 'Something for scale, such as a fork or your hand', 'Separate photos for separate plates'];
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Lightbulb size={16} color={colors.textSecondary} />
        <Text variant="label" color="textSecondary">
          For a better estimate
        </Text>
      </View>
      {tips.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: 4 }}>
          <Text variant="body" color="textTertiary">
            ·
          </Text>
          <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}
