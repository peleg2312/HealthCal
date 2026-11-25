import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, ChevronUp, Droplet, FlaskConical, ImagePlus, Info, Lightbulb, MessageSquareText, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions, Platform, useWindowDimensions, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { AddMissingItem } from '@/features/ai/AddMissingItem';
import { AiConsentSheet } from '@/features/ai/AiConsentSheet';
import { AiDataLine } from '@/features/ai/AiDataLine';
import { AiError, aiError, type AiErrorCode } from '@/features/ai/api';
import { AnalysingView } from '@/features/ai/AnalysingView';
import { agreeToAi, checkAiConsent, loadAiConsent, useAiConsent, withdrawAiConsent } from '@/features/ai/consent';
import { availability, DEMO_ERROR_CODES } from '@/features/ai/demo';
import { ErrorView, type ErrorAction, type ScreenErrorCode } from '@/features/ai/ErrorView';
import { CAREFUL_COST, carefulUses, estimateLimitWords, estimatesLeft, plusLimitOf, plusLink, retryCostLine, type LimitInfo } from '@/features/ai/limit';
import {
  ADDED_FAT_OPTIONS,
  applyAddedFat,
  calorieRange,
  CONFIDENCE_WORDS,
  confidenceLevel,
  estimateGrams,
  formatKcalRange,
  makeRow,
  overallConfidence,
  rangeWord,
  renameRow,
  rowsFromResult,
  rowsToLogItems,
  rowWiden,
  setRowGrams,
  shownRowName,
  swapRow,
  totals,
  unswapRow,
  withCorrection,
  type AddedFat,
  type ReviewRow,
} from '@/features/ai/estimate';
import { ItemRow } from '@/features/ai/ItemRow';
import { emojiLike, matchFoods } from '@/features/ai/localMatch';
import { AiGlyph, AiMark } from '@/features/ai/mark';
import { PhotoHero } from '@/features/ai/PhotoHero';
import { SampleNotice } from '@/features/ai/SampleNotice';
import { photoText, readWeight } from '@/features/ai/weight';
import { DESCRIPTION_MAX, estimateReadyLine, prefilledDescription } from '@/features/ai/words';
import { SaveMealRow } from '@/features/ai/SaveMealRow';
import { MealPicker } from '@/features/food/components';
import { checkoutShown, PLAN_ROUTE, planVisible, refreshPlanAfterLimit, usePlan } from '@/features/plan';
import { logAndSaveMeal, logItems } from '@/features/food/log';
import { aiAddTitle, aiMealName } from '@/features/food/saveWords';
import { BUILTIN_FOODS } from '@/data/foods';
import { isolateRtl } from '@/lib/bidi';
import { today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { mealForTime, MEALS } from '@/lib/nutrition';
import { useAuth } from '@/services/auth';
import { analyzeFood, PhotoError, pickPhoto, prepareImage, takePendingPhoto, type PickedPhoto, type PreparedImage } from '@/services/aiFood';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { cup, useLargeText, useTheme } from '@/theme';
import type { AiFoodResult, Food, MealType } from '@/types';
import { AnimatedNumber, Button, Card, Chip, CupKey, decorative, Divider, FadeUp, goBack, haptic, Header, MacroBar, PressableScale, Screen, Segmented, Text, TextField, toast } from '@/ui';

type InputMode = 'photo' | 'text';
type Step = 'capture' | 'analysing' | 'review' | 'error';
interface ScreenError {
  code: ScreenErrorCode;
  message: string;
  retryable: boolean;
  /** The failed attempt was the careful pass over an existing result. */
  precise: boolean;
  /** A limit answer's plan fields (@/features/ai/limit), or null: today's words. */
  limit?: LimitInfo | null;
  /** The allowance last heard of before the refused call ("N AI estimates left today"), or null. */
  leftBefore?: number | null;
}

const isMeal = (v: unknown): v is MealType => MEALS.some((m) => m.id === v);
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
/** The total as it is shown, "~507": an estimate, never a bare number. */
const approx = (n: number) => `~${Math.round(n)}`;
/** The review's blocks enter one after another, 60 ms apart (the coach's rhythm); the last starts at 300 ms. */
const ARRIVE_STEP = 60;
/** Cancel ignores a press this soon after the wait starts: it is the second tap of a double tap on Estimate. */
const CANCEL_AFTER_MS = 400;
/** Hide from sight, keep for screen readers: the web's polite live region that says an estimate arrived. */
const SPOKEN_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

export default function PhotoScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; mode?: string; words?: string; demoError?: string; demoWait?: string; demoLive?: string }>();
  const { colors, radius, spacing } = useTheme();
  // A 320 px phone gets the short forms of the longest labels, so none is cut.
  const narrow = useWindowDimensions().width < 360;
  const session = useAuth((s) => s.session);
  const access = availability(isBackendConfigured, !!session);
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();
  const demoError = (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') && DEMO_ERROR_CODES.includes(params.demoError as AiErrorCode) ? (params.demoError as AiErrorCode) : undefined;
  // Test-hook builds only: `?demoWait=1` holds the wait for an estimate (`careful`: only the careful
  // check's) until Cancel, so the waiting view can be looked at and scanned. Nothing is sent meanwhile.
  const demoWait = (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') && (params.demoWait === '1' || params.demoWait === 'careful') ? params.demoWait : undefined;
  // Test-hook builds only: `?demoLive=1` draws the sample result the way a live estimate is drawn (the
  // AI's mark beside the dish, the photo as the hero), so the live review can be looked at and scanned
  // without an account. Still the fixed sample, and nothing is sent.
  const demoLive = (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') && params.demoLive === '1';

  const [mode, setMode] = useState<InputMode>(params.mode === 'text' ? 'text' : 'photo');
  const [step, setStep] = useState<Step>('capture');
  const [meal, setMeal] = useState<MealType>(isMeal(params.meal) ? params.meal : mealForTime());
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [preview, setPreview] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState('');
  // The meal's weighed total as typed, optional (@/features/ai/weight: grams, or ounces for imperial),
  // whether its problem is on show (after the field is left or Estimate is tapped, not while typing),
  // and the total the shown estimate was made with, as the person typed it.
  const [weightText, setWeightText] = useState('');
  const [weightChecked, setWeightChecked] = useState(false);
  const [usedWeight, setUsedWeight] = useState<string | null>(null);
  const units = useStore((s) => s.profile?.units) ?? 'metric';
  const weight = readWeight(weightText, units);
  // Words typed in food search arrive as `words` (search's "Describe" tile) and fill the field once, when the
  // screen opens; nothing is sent until Estimate. The caret starts after them, so amounts can be added at once.
  const [description, setDescription] = useState(() => prefilledDescription(params.words));
  const [caret, setCaret] = useState<number | null>(() => prefilledDescription(params.words).length || null);
  const [result, setResult] = useState<AiFoodResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fat, setFat] = useState<AddedFat>('none');
  const [remaining, setRemaining] = useState<number | null>(null);
  const plan = usePlan();
  const [precisePass, setPrecisePass] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [addingAi, setAddingAi] = useState(false);
  const [pendingPrecise, setPendingPrecise] = useState(false);
  const [correction, setCorrection] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  // "Also save as a meal": off on every visit (not remembered, so My meals does not fill with one-off
  // plates). The name follows the dish (null) until the person types one; both last for the screen.
  const [saveOn, setSaveOn] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  // One arrival of an estimate: when it came and the order of the rows it brought. The review's blocks
  // and those rows enter one after another once per arrival (keyed by it), and the total counts up
  // from the low end of its range; an edit, a swap or a row added later never replays it.
  const [arrival, setArrival] = useState<{ at: number; order: Record<string, number> }>({ at: 0, order: {} });
  // The arrival the review has already shown in parts (noted when a new wait starts): when the review
  // comes back with the same one (a re-estimate or the careful check cancelled, or failed), it is drawn
  // at once, since nothing arrived.
  const [arrivalShown, setArrivalShown] = useState(0);
  const replay = arrival.at !== arrivalShown;
  // What the web's live region says (it stays mounted through every step, so a screen reader hears the
  // arrival without focus moving); natively the same line is announced.
  const [spoken, setSpoken] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // When the wait began: Cancel takes Estimate's place in the footer, so the second tap of a double tap
  // would land on it; a press in the first `CANCEL_AFTER_MS` is ignored (read in the handler).
  const waitStartedAt = useRef(0);
  // Before the first live estimate on this device, ask (see @/features/ai/consent).
  const agreed = useAiConsent();
  const [consentOpen, setConsentOpen] = useState(false);
  // Kept while the sheet slides away, so its buttons do not change on the way out.
  const [consentMode, setConsentMode] = useState<'ask' | 'review'>('ask');
  const openConsent = (m: 'ask' | 'review') => {
    setConsentMode(m);
    setConsentOpen(true);
  };
  const afterConsent = useRef<(() => void) | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // Where the item rows sit in the scroll content, so a hero pill can scroll to one.
  const layout = useRef<{ section: number; card: number; rows: Record<string, number> }>({ section: 0, card: 0, rows: {} });
  const customFoods = useLive('customFoods');
  // The person's own foods first, then the bundled reference foods.
  const matchPool: Food[] = [...customFoods, ...BUILTIN_FOODS];

  useEffect(() => {
    void loadAiConsent();
  }, []);

  /**
   * True when an estimate may run now. A live estimate sends the photo or words
   * out, so a device that has not agreed is asked first, and `retry` runs once
   * it agrees. Sample mode sends nothing and never asks.
   */
  async function mayEstimate(retry: () => void): Promise<boolean> {
    if (!access.live || (await checkAiConsent())) return true;
    afterConsent.current = retry;
    openConsent('ask');
    return false;
  }

  async function agree() {
    const next = afterConsent.current;
    afterConsent.current = null;
    setConsentOpen(false);
    await agreeToAi();
    next?.();
  }

  function closeConsent() {
    afterConsent.current = null;
    setConsentOpen(false);
  }

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 1600);
    return () => clearTimeout(t);
  }, [highlight]);

  const searchHref = `/food/search?meal=${meal}&date=${date}`;
  const weightError = mode === 'photo' && weightChecked ? weight.problem : null;
  // A total that cannot be used does not disable the button: tapping it says why (a disabled button would not).
  const ready = mode === 'photo' ? !!preview : description.trim().length >= 3;

  function estimate() {
    if (mode === 'photo' && weight.problem) {
      setWeightChecked(true);
      haptic.warn();
      return;
    }
    void analyse(false);
  }

  const fail = (e: unknown, precise: boolean) => {
    haptic.warn();
    if (e instanceof AiError) {
      if (e.remaining !== null) setRemaining(e.remaining);
      setError({ code: e.code, message: e.message, retryable: e.retryable, precise, limit: e.limit, leftBefore: remaining });
      // The server decides the limit: ask it for the plan again, so the link and the numbers are current.
      if (e.code === 'daily_limit') void refreshPlanAfterLimit();
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
    if (!(await mayEstimate(() => void analyse(precise, fix)))) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPendingPrecise(precise);
    waitStartedAt.current = Date.now();
    // The review on screen (if any) has been shown in parts: should this wait be cancelled, it comes back at once.
    setArrivalShown(arrival.at);
    setStep('analysing');
    try {
      if (demoWait && (precise || demoWait === '1')) {
        await new Promise<void>((resolve) => controller.signal.addEventListener('abort', () => resolve()));
        return;
      }
      let image: string | undefined;
      if (mode === 'photo' && photo && preview) {
        // The careful pass gets more pixels: 1024 px instead of 768 px.
        image = precise ? (await prepareImage(photo, { precise: true })).base64 : preview.base64;
      }
      // A weighed total goes first, in the measured words (@/features/ai/weight).
      const base = mode === 'photo' ? photoText(note, weight.grams) : description.trim();
      const text = fix?.trim() ? withCorrection(base, fix) : base;
      const res = await analyzeFood({ image, text, precise }, { signal: controller.signal, demoError });
      if (controller.signal.aborted) return;
      setResult(res.result);
      if (res.remaining !== null) setRemaining(res.remaining);
      // A new pass replaces what the model found; items the user added stay.
      const kept = rows.filter((r) => r.kind === 'added');
      const next = applyAddedFat([...rowsFromResult(res.result), ...kept], fat);
      setRows(next);
      setArrival({ at: Date.now(), order: Object.fromEntries(next.map((r, i) => [r.key, i])) });
      setPrecisePass(precise || (!!fix && precisePass));
      setUsedWeight(mode === 'photo' ? weight.shown : null);
      if (fix) setCorrection('');
      setError(null);
      setStep('review');
      haptic.success();
      announceArrival(next, res.result.demo === true && !demoLive);
    } catch (e) {
      if (isAbort(e) || controller.signal.aborted) return;
      fail(e, precise);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  /** Says the estimate arrived, its total and how many items to check, without moving focus (WCAG 4.1.3). */
  function announceArrival(next: ReviewRow[], sample: boolean) {
    const its = next.map((r) => r.item);
    const line = estimateReadyLine({
      kcal: totals(its).kcal,
      range: calorieRange(
        its,
        next.map((r) => rowWiden(r, mode === 'photo')),
      ),
      items: next.length,
      sample,
    });
    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(line);
      return;
    }
    // Emptied first, so the same words after a second estimate are still a change the region reads out.
    setSpoken('');
    setTimeout(() => setSpoken(line), 150);
  }

  function cancel() {
    if (Date.now() - waitStartedAt.current < CANCEL_AFTER_MS) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setStep(result ? 'review' : 'capture');
  }

  async function askAiForItem(text: string): Promise<boolean> {
    if (!(await mayEstimate(() => void askAiForItem(text)))) return false;
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
    // An estimated row wears the mark of the food in the list it names outright, so the diary reads as food.
    const items = rowsToLogItems(rows, newId, mode === 'photo', (name) => emojiLike(name, matchPool));
    if (items.length === 0) return;
    // With the switch on, one act logs and saves: one toast that names the meal, one Undo for both.
    // Never for the sample (it is example data, not the person's food nor an AI estimate).
    // The toast keeps as much of the name as two lines hold at the window's width now.
    if (saveOn && !isDemo) logAndSaveMeal(items, meal, date, (saveName ?? '').trim() || aiMealName(result?.dish, items), Dimensions.get('window').width);
    else logItems(items, meal, date);
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
    toast(`Removed ${isolateRtl(shownRowName(r).trim()) || 'item'}`, {
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
  // A photo answer's band is wider, and a quick one is called rough (src/features/ai/estimate.ts, PHOTO_SPREAD).
  const range = calorieRange(
    items,
    rows.map((r) => rowWiden(r, mode === 'photo')),
  );
  const word = rangeWord(mode === 'photo', precisePass);
  // The total counts up from the low end of its range, so it never shows a number outside it; with no range it is drawn at once.
  const countFrom = range[1] > range[0] ? range[0] : undefined;
  const conf = confidenceLevel(overallConfidence(rows.filter((r) => r.kind === 'detected').map((r) => r.item)));
  const isDemo = !!result?.demo && !demoLive;
  // The sample result is not about the photo, so it does not wear it.
  const heroPhoto = mode === 'photo' && preview && !isDemo ? preview.uri : null;
  // At the limit with plans on: the plan-aware words, and on the free plan one quiet link to the plan
  // (only where the plan is shown at all and this copy may show the checkout, rulings R14, R15, R19).
  const limitWords = error?.code === 'daily_limit' && error.limit ? estimateLimitWords(error.limit, error.leftBefore ?? null) : null;
  const plansLink =
    limitWords?.offerPlans && planVisible(plan) && checkoutShown()
      ? { testID: 'ai-limit-plans', label: plusLink(plusLimitOf(plan, 'estimates')), onPress: () => router.push(PLAN_ROUTE as never) }
      : undefined;
  // On the free plan the careful check says what it uses (ruling R18).
  const carefulLine = plan.known && plan.plansOn && plan.plan === 'free' ? carefulUses(CAREFUL_COST, plan.limits.estimates) : null;
  const allowance = remaining !== null ? estimatesLeft(remaining) : null;

  // The footer's button is one element through the steps (Estimate, then Cancel, then Add), always in the
  // same place in the tree: a keyboard or screen-reader user's focus stays on it when the estimate arrives,
  // never dropped to the page.
  let footerButton: React.ReactNode = null;
  let footerExtra: React.ReactNode = null;
  if (step === 'capture' && (mode === 'text' || preview || preparing)) {
    footerButton = (
      <Button
        testID="ai-analyse"
        title="Estimate nutrition"
        icon={<AiGlyph name="estimate" size={18} color={colors.onPrimary} strokeWidth={2.2} />}
        disabled={!ready}
        loading={preparing}
        onPress={estimate}
      />
    );
  } else if (step === 'analysing') {
    footerButton = <Button testID="ai-cancel" title="Cancel" variant="secondary" onPress={cancel} />;
  } else if (step === 'review') {
    const saving = saveOn && !isDemo;
    // The sample is example data: it is never offered as one of my meals.
    footerExtra = isDemo ? null : <SaveMealRow on={saveOn} onChange={setSaveOn} name={saveName ?? aiMealName(result?.dish, items)} onName={setSaveName} />;
    footerButton = (
      <Button
        testID="ai-add-to-diary"
        // The total is the large number at the top: the button names where it goes, not the number again.
        title={aiAddTitle({ sample: isDemo, save: saving, meal: MEALS.find((m) => m.id === meal)?.label ?? '' })}
        disabled={items.length === 0}
        onPress={add}
      />
    );
  }
  const footer = footerButton ? (
    <View style={{ gap: spacing.sm }}>
      {footerExtra}
      {footerButton}
    </View>
  ) : null;

  return (
    <Screen
      // The sample is not the AI: its header says so ("Sample"), as its rows do; the flask stays its mark.
      header={<Header title={title} subtitle={isDemo ? 'Sample' : 'AI estimate'} close onBack={() => goBack(`/diary?date=${date}`)} />}
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
                      ...cup(radius.card),
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
                    <Button testID="ai-repick" title={narrow ? 'Library' : 'Choose another'} accessibilityLabel="Choose another photo" variant="secondary" size="sm" full={false} style={{ flex: 1 }} icon={<ImagePlus size={16} color={colors.text} />} onPress={() => void choose('library')} />
                  </View>
                </View>
              ) : (
                <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
                  <AiGlyph name="photo" size={32} color={colors.text} />
                  <Text variant="h3" align="center">
                    Photograph your meal
                  </Text>
                  <Text variant="body" color="textSecondary" align="center">
                    Nothing is added until you check it.
                  </Text>
                  <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xs }}>
                    <Button testID="ai-take-photo" title="Take photo" icon={<Camera size={18} color={colors.onPrimary} />} onPress={() => void choose('camera')} />
                    <Button testID="ai-choose-photo" title="Choose from library" variant="secondary" icon={<ImagePlus size={18} color={colors.text} />} onPress={() => void choose('library')} />
                  </View>
                </Card>
              )}
              <TextField
                testID="ai-photo-weight"
                label={units === 'imperial' ? 'Weighed it? Total ounces (optional)' : 'Weighed it? Total grams (optional)'}
                accessibilityLabel={`Weighed it? Total ${units === 'imperial' ? 'ounces' : 'grams'} of food, without the plate. Optional`}
                value={weightText}
                onChangeText={(t) => {
                  setWeightText(t);
                  setWeightChecked(false);
                }}
                onBlur={() => setWeightChecked(true)}
                keyboardType={units === 'imperial' ? 'decimal-pad' : 'number-pad'}
                inputMode={units === 'imperial' ? 'decimal' : 'numeric'}
                suffix={units === 'imperial' ? 'oz' : 'g'}
                maxLength={8}
                hint="Food only, without the plate or bowl."
                error={weightError}
              />
              <TextField
                testID="ai-photo-note"
                label="Anything the photo can't show? (optional)"
                placeholder="e.g. cooked in butter, large plate"
                value={note}
                onChangeText={setNote}
                maxLength={200}
              />
              {access.live ? <AiDataLine mode={mode} onPress={() => openConsent('review')} /> : null}
              {!photo ? <PhotoTips /> : null}
            </>
          ) : (
            <>
              <TextField
                testID="ai-description"
                label="What did you eat?"
                placeholder="e.g. Two scrambled eggs with butter, one slice of sourdough toast and a flat white"
                value={description}
                onChangeText={(t) => {
                  setCaret(null);
                  setDescription(t);
                }}
                // Placed once, after prefilled words; the person's own taps and typing move it from then on.
                selection={caret !== null ? { start: caret, end: caret } : undefined}
                onSelectionChange={caret !== null ? (e) => e.nativeEvent.selection.start === caret && setCaret(null) : undefined}
                multiline
                maxLength={DESCRIPTION_MAX}
                autoFocus
                lines={4}
                hint="Amounts and cooking method help."
              />
              {access.live ? <AiDataLine mode={mode} onPress={() => openConsent('review')} /> : null}
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
          <ErrorView
            code={error.code}
            message={error.message}
            actions={errorActions()}
            footnote={error.code === 'daily_limit' ? undefined : (allowance ?? undefined)}
            title={limitWords?.title}
            body={limitWords?.body}
            link={plansLink}
            limit={error.limit}
            leftBefore={error.leftBefore}
          />
        </>
      ) : null}

      {step === 'review' && result ? (
        <>
          {/* The estimate arrives in parts, once per arrival: the summary, then the items, the fat question, the note, the meal and the second tries. */}
          <FadeUp key={`a0-${arrival.at}`} disabled={!replay} style={{ gap: spacing.lg }}>
            {isDemo ? <SampleNotice reason={access.live ? 'signed_out' : access.reason} variant="result" /> : null}

            {heroPhoto ? (
              <>
                <PhotoHero
                  uri={heroPhoto}
                  dish={result.dish}
                  kcal={sum.kcal}
                  from={countFrom}
                  arrival={arrival.at}
                  range={`${formatKcalRange(range, word)} kcal`}
                  items={rows.filter((r) => r.kind !== 'fat').map((r) => ({ key: r.key, item: { ...r.item, name: shownRowName(r) } }))}
                  onItemPress={showRow}
                />
                <Card style={{ gap: spacing.md }}>
                  {/* The AI's mark leads the line that says so, as it leads each estimated row below. */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <AiMark size="small" testID="ai-result-mark" style={{ marginTop: 1 }} />
                    <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
                      {`AI estimate · ${CONFIDENCE_WORDS[conf]}${precisePass ? ' · checked carefully' : ''}`}
                    </Text>
                  </View>
                  {/* The weighed total went with the photo: say so, so the person knows the estimate leaned on it. */}
                  {usedWeight !== null && !isDemo ? (
                    <Text variant="caption" color="textSecondary" testID="ai-weight-used">
                      {`Made with your weighed total, ${usedWeight}`}
                    </Text>
                  ) : null}
                  <MacroBar protein={sum.protein} carbs={sum.carbs} fat={sum.fat} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm }}>
                    <MacroStat label="Protein" value={sum.protein} color={colors.protein} />
                    <MacroStat label="Carbs" value={sum.carbs} color={colors.carbs} />
                    <MacroStat label="Fat" value={sum.fat} color={colors.fat} />
                  </View>
                </Card>
              </>
            ) : (
              // The total, kept compact (12 px between its parts, the photo hero's 46 px figure) so the items start in
              // the first view; under 360 px the macro bar is left out, the three figures with their keys say the same.
              <Card style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  {/* The AI's cup says "the AI made this, check it". The sample is not the AI and does not wear its mark. */}
                  {isDemo ? (
                    decorative(<FlaskConical size={24} color={colors.text} strokeWidth={1.9} />)
                  ) : (
                    <View style={{ width: 24, alignItems: 'center' }}>
                      <AiMark size="row" testID="ai-result-mark" />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="h3" numberOfLines={2} testID="ai-dish">
                      {result.dish}
                    </Text>
                    {/* The notice above already says it is a sample, so the sample's dish has no second line. */}
                    {isDemo ? null : (
                      <Text variant="caption" color="textSecondary">
                        {`AI estimate · ${CONFIDENCE_WORDS[conf]}${precisePass ? ' · checked carefully' : ''}`}
                      </Text>
                    )}
                  </View>
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <AnimatedNumber
                      variant="numXL"
                      tabular
                      color="caloriesInk"
                      testID="ai-total-kcal"
                      value={sum.kcal}
                      from={countFrom}
                      format={approx}
                      memoryKey={`ai-total-${arrival.at}`}
                      style={{ fontSize: 46, lineHeight: 50, letterSpacing: -1.4 }}
                    />
                    <Text variant="unit" style={{ fontSize: 15 }}>
                      kcal
                    </Text>
                  </View>
                  <Text variant="label" color="textSecondary" testID="ai-total-range">
                    {formatKcalRange(range, word)} kcal
                  </Text>
                </View>
                {narrow ? null : <MacroBar protein={sum.protein} carbs={sum.carbs} fat={sum.fat} />}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm }}>
                  <MacroStat label="Protein" value={sum.protein} color={colors.protein} />
                  <MacroStat label="Carbs" value={sum.carbs} color={colors.carbs} />
                  <MacroStat label="Fat" value={sum.fat} color={colors.fat} />
                </View>
              </Card>
            )}
          </FadeUp>

          {/* The plain View keeps the section's place in the scroll content for the hero's chips. */}
          <View onLayout={(e) => (layout.current.section = e.nativeEvent.layout.y)}>
            <FadeUp key={`a2-${arrival.at}`} disabled={!replay} delay={ARRIVE_STEP} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
                <Text variant="h3">Items</Text>
                <Text variant="caption" color="textSecondary" align="right" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {narrow ? 'Tap to correct' : 'Tap a name or weight to correct'}
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
                        ...cup(radius.tile, 5),
                        backgroundColor: highlight === r.key ? colors.surfaceAlt : 'transparent',
                      }}>
                      {/* A row the estimate brought enters in its turn (once: not again when the review comes back); one added later enters at once. */}
                      <FadeUp
                        key={`${r.key}-${arrival.at}`}
                        disabled={!replay && r.key in arrival.order}
                        delay={r.key in arrival.order ? Math.min((1 + arrival.order[r.key]) * ARRIVE_STEP, 400) : 0}>
                        {i > 0 ? <Divider /> : null}
                        <ItemRow
                          row={r}
                          index={i}
                          sample={isDemo}
                          matches={swappable(r) ? matchFoods(r.estimate?.name ?? r.item.name, matchPool, 3) : []}
                          onSwap={!swappable(r) ? undefined : (food) => setRows((rs) => rs.map((x) => (x.key === r.key ? swapRow(x, food) : x)))}
                          onUnswap={() => setRows((rs) => rs.map((x) => (x.key === r.key ? unswapRow(x) : x)))}
                          onGrams={(g) => setRows((rs) => rs.map((x) => (x.key === r.key ? setRowGrams(x, g) : x)))}
                          onRename={(name) => setRows((rs) => rs.map((x) => (x.key === r.key ? renameRow(x, name) : x)))}
                          onRemove={() => removeRow(r)}
                        />
                      </FadeUp>
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
            </FadeUp>
          </View>

          {/* Hidden fat, after the items it changes: the items are what the review is for, so they come first. */}
          <FadeUp key={`a1-${arrival.at}`} disabled={!replay} delay={2 * ARRIVE_STEP}>
            <Card style={{ gap: spacing.md, borderColor: result.hiddenFatQuestion ? colors.borderStrong : colors.border }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                {decorative(<Droplet size={18} color={colors.fat} style={{ marginTop: 2 }} />)}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="title">{result.hiddenFatQuestion ?? 'Cooked or dressed with fat?'}</Text>
                  <Text variant="caption" color="textSecondary">
                    Rarely visible. 1 tsp is about 40 kcal.
                  </Text>
                </View>
              </View>
              {/* 12 px between the two lines a 320 px phone has: each chip is 44 px tall to touch, and one line never takes the other's taps. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md }}>
                {ADDED_FAT_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    testID={`ai-fat-${o.value}`}
                    label={o.label}
                    selected={fat === o.value}
                    onPress={() => chooseFat(o.value)}
                    // At 320 px the four do not fit one line: two by two, rather than "2 tbsp" alone on a second line.
                    style={narrow ? { flexBasis: '40%', flexGrow: 1, justifyContent: 'center' } : undefined}
                  />
                ))}
              </View>
            </Card>
          </FadeUp>

          {result.note ? (
            <FadeUp key={`a3-${arrival.at}`} disabled={!replay} delay={3 * ARRIVE_STEP} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }} testID="ai-note">
              {decorative(<Info size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />)}
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {result.note}
              </Text>
            </FadeUp>
          ) : null}

          <FadeUp key={`a4-${arrival.at}`} disabled={!replay} delay={4 * ARRIVE_STEP} style={{ gap: spacing.sm }}>
            <Text variant="h3">Meal</Text>
            {/* The diary's meal tabs: "Breakfast" fits whole in a quarter of a 320 px phone. */}
            <MealPicker value={meal} onChange={setMeal} testIDPrefix="ai-meal" />
          </FadeUp>

          {/* Second tries, below the meal: say what it got wrong, or run the careful check, each with its true cost (retryCostLine). */}
          <FadeUp key={`a5-${arrival.at}`} disabled={!replay} delay={5 * ARRIVE_STEP}>
            <Card style={{ gap: spacing.md }} testID="ai-correction">
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                {decorative(<MessageSquareText size={18} color={colors.text} strokeWidth={1.9} style={{ marginTop: 2 }} />)}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="title">Not quite right?</Text>
                  <Text variant="caption" color="textSecondary">
                    {retryCostLine(precisePass, !!carefulLine)}
                  </Text>
                </View>
              </View>
              <TextField
                testID="ai-correction-input"
                placeholder={narrow ? 'e.g. no cheese' : 'e.g. cauliflower rice, no cheese'}
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
              {!precisePass ? (
                <Button
                  testID="ai-check-again"
                  title={narrow ? 'Check more carefully' : 'Check again more carefully'}
                  variant="ghost"
                  size="md"
                  icon={<AiGlyph name="estimate" size={16} color={colors.primaryInk} strokeWidth={2.2} />}
                  accessibilityLabel={`Check again more carefully with a stronger model${mode === 'photo' ? ' and a sharper copy of the photo' : ''}. Uses ${CAREFUL_COST} of today's AI estimates and keeps the items you added`}
                  onPress={() => void analyse(true)}
                />
              ) : null}
              {!precisePass && carefulLine ? (
                <Text variant="caption" color="textSecondary" testID="ai-careful-uses">
                  {carefulLine}
                </Text>
              ) : null}
              {allowance ? (
                <Text variant="caption" color="textTertiary" testID="ai-remaining">
                  {allowance}
                </Text>
              ) : null}
            </Card>
          </FadeUp>
        </>
      ) : null}
      {/* Mounted through every step, so it is in place before the words change: an estimate's arrival is heard without focus moving. */}
      {Platform.OS === 'web' ? (
        <Text testID="ai-announce" style={SPOKEN_ONLY} {...({ 'aria-live': 'polite', 'aria-atomic': true } as object)}>
          {spoken}
        </Text>
      ) : null}
      <AiConsentSheet
        visible={consentOpen}
        mode={consentMode}
        agreed={agreed}
        onAgree={() => void agree()}
        onClose={closeConsent}
        onWithdraw={() => {
          closeConsent();
          void withdrawAiConsent();
          toast('Agreement withdrawn. HealthCal asks again before the next estimate.');
        }}
      />
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
          // The note, with the weight before it, becomes the description; a weight alone names no food, so it is not carried.
          const words = note.trim() ? photoText(note, weight.grams) : undefined;
          if (words && !description.trim()) setDescription(words);
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

/** One macro of the estimate's total, in whole grams ("53 g", never "52.9 g": principle 2). */
function MacroStat({ label, value, color }: { label: string; value: number; color: string }) {
  // Three a line; with large text the row wraps (each at least 120 wide), so "Protein" never runs into "Carbs".
  const big = useLargeText();
  return (
    <View style={[big ? { flexGrow: 1, flexBasis: 120 } : { flex: 1 }, { gap: 2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={color} />
        <Text variant="label">{label}</Text>
      </View>
      <Text variant="numM" tabular style={{ fontSize: 17, lineHeight: 22 }}>
        {estimateGrams(value)}
        <Text variant="unit">{' g'}</Text>
      </Text>
    </View>
  );
}

/** Tips for a better photo, folded under one line until asked for. */
function PhotoTips() {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const tips = ['The whole plate in frame, shot from above', 'Good light, no strong shadows', 'Something for scale, such as a fork or your hand', 'Separate photos for separate plates'];
  return (
    <View style={{ gap: spacing.sm }}>
      <PressableScale
        testID="ai-photo-tips"
        onPress={() => setOpen((v) => !v)}
        feedback="select"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        {...({ 'aria-expanded': open } as object)}
        accessibilityLabel="Tips for a better estimate"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, alignSelf: 'flex-start' }}>
        <Lightbulb size={16} color={colors.textSecondary} />
        <Text variant="label" color="textSecondary">
          Tips for a better estimate
        </Text>
        {open ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
      </PressableScale>
      {open
        ? tips.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: 4 }}>
              <Text variant="body" color="textTertiary">
                ·
              </Text>
              <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
                {t}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}
