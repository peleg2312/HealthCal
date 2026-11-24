import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CloudOff, Flashlight, FlashlightOff, Keyboard, PackageSearch, PackageX, ScanBarcode } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { checkBarcode, cleanBarcode, findLocalByBarcode, lookupCode } from '@/features/ai/barcode';
import { ScanResultCard, type ScanFoundFrom } from '@/features/ai/ScanResultCard';
import { setFoodDraft } from '@/features/food/draft';
import { href, kcal } from '@/features/food/helpers';
import { logFood } from '@/features/food/log';
import { isolateRtl } from '@/lib/bidi';
import { today } from '@/lib/dates';
import { entriesTotal, mealForTime, MEALS } from '@/lib/nutrition';
import { lookupBarcode } from '@/services/openFoodFacts';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import type { Food, MealType, Serving } from '@/types';
import { Button, Card, goBack, haptic, Header, IconButton, Screen, Text, TextField } from '@/ui';

type Phase =
  | { kind: 'scan' }
  | { kind: 'looking'; code: string }
  | { kind: 'found'; code: string; food: Food; from: ScanFoundFrom }
  | { kind: 'not_found'; code: string }
  | { kind: 'incomplete'; code: string; name: string }
  | { kind: 'error'; code: string };

const isMeal = (v: unknown): v is MealType => MEALS.some((m) => m.id === v);
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const { colors, radius, spacing } = useTheme();
  const meal: MealType = isMeal(params.meal) ? params.meal : mealForTime();
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();
  const web = Platform.OS === 'web';

  const [permission, requestPermission] = useCameraPermissions();
  // Web starts on typing: asking for the webcam on page load is intrusive, and many desktops have none.
  const [manual, setManual] = useState(web);
  const [hasCamera, setHasCamera] = useState(!web);
  const [mountError, setMountError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const locked = useRef(false);
  const lookupId = useRef(0);
  // The product just handled is often still in front of the camera: ignore it briefly.
  const recent = useRef<{ code: string; at: number } | null>(null);
  // Entries that already existed when the screen opened. Compared by id, not by time: a clock
  // that was wrong when an entry was logged must not make old entries count as added here.
  const [existing] = useState(() => new Set(Object.keys(useStore.getState().foodEntries)));
  const [manualKey, setManualKey] = useState(0);
  const entries = useLive('foodEntries');
  // Everything added to this day since the scanner opened (Undo lowers it).
  const added = entries.filter((e) => e.date === date && !existing.has(e.id));
  const addedKcal = entriesTotal(added).kcal;

  useEffect(() => {
    if (!web) return;
    CameraView.isAvailableAsync()
      .then(setHasCamera)
      .catch(() => setHasCamera(false));
  }, [web]);

  /** The person's own copy of a product, if they have one: no network needed. */
  function findOwn(code: string) {
    const s = useStore.getState();
    const custom = Object.values(s.customFoods);
    const deletedCustom = new Set(custom.filter((f) => f.deleted).map((f) => f.id));
    return findLocalByBarcode(code, {
      custom,
      recent: s.recentFoods.filter((f) => !deletedCustom.has(f.id)),
      // A diary entry still carries a copy of an own food after that food was deleted.
      entries: Object.values(s.foodEntries).filter((e) => !(e.food?.source === 'custom' && (deletedCustom.has(e.food.id) || !s.customFoods[e.food.id]))),
    });
  }

  async function lookup(raw: string, type?: string) {
    const code = lookupCode(raw, type);
    const id = ++lookupId.current;
    const own = findOwn(code);
    if (own) {
      setPhase({ kind: 'found', code, food: own.food, from: own.from });
      return;
    }
    setPhase({ kind: 'looking', code });
    try {
      const res = await lookupBarcode(code);
      if (id !== lookupId.current) return;
      if (res.status === 'found') {
        setPhase({ kind: 'found', code, food: res.food, from: 'openfoodfacts' });
        return;
      }
      haptic.warn();
      setPhase(res.status === 'incomplete' ? { kind: 'incomplete', code, name: res.name } : { kind: 'not_found', code });
    } catch {
      if (id !== lookupId.current) return;
      haptic.warn();
      setPhase({ kind: 'error', code });
    }
  }

  function onScanned(result: BarcodeScanningResult) {
    // One barcode, one lookup: the camera reports the same code many times a second.
    if (locked.current) return;
    const code = cleanBarcode(result.data);
    if (code.length < 6) return;
    if (recent.current && recent.current.code === lookupCode(code, result.type) && Date.now() - recent.current.at < 2500) return;
    locked.current = true;
    haptic.success();
    void lookup(code, result.type);
  }

  function addFound(food: Food, serving: Serving, quantity: number) {
    // logFood shows the Undo toast and keeps recents up to date.
    logFood({ food, serving, quantity, meal, date });
    setManualKey((k) => k + 1);
    scanAgain();
  }

  function openDetails(food: Food) {
    setFoodDraft(food);
    router.push(href('/food/detail', { meal, date }) as never);
  }

  function scanAgain() {
    if (phase.kind !== 'scan' && 'code' in phase) recent.current = { code: phase.code, at: Date.now() };
    lookupId.current++;
    locked.current = false;
    setPhase({ kind: 'scan' });
  }

  async function startCamera() {
    const res = permission?.granted ? permission : await requestPermission();
    if (res.granted) {
      setMountError(null);
      setManual(false);
      scanAgain();
    }
  }

  const granted = !!permission?.granted;
  const scanning = phase.kind === 'scan' || phase.kind === 'found';
  const showCamera = !manual && scanning && granted && !mountError;
  const found = phase.kind === 'found' ? phase : null;
  const resultCard = found ? (
    <ScanResultCard
      key={`${found.code}-${found.food.id}`}
      food={found.food}
      from={found.from}
      meal={meal}
      date={date}
      onAdd={(serving, quantity) => addFound(found.food, serving, quantity)}
      onDetails={() => openDetails(found.food)}
      onClose={scanAgain}
    />
  ) : null;
  const footer =
    added.length > 0 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title" tabular testID="scan-added-count">
            {added.length} added · {kcal(addedKcal)} kcal
          </Text>
          <Text variant="caption" color="textSecondary">
            {found ? 'Add this one, or close it to scan the next' : manual ? 'Type the next number, or finish' : 'Point at the next barcode, or finish'}
          </Text>
        </View>
        <Button testID="scan-done" title="Done" size="md" full={false} onPress={() => goBack(href('/diary', { date }))} />
      </View>
    ) : undefined;
  const cameraOffer = hasCamera && (web || permission?.canAskAgain !== false || granted);

  return (
    <Screen
      scroll={!showCamera}
      footer={footer}
      header={
        <Header
          title="Scan barcode"
          subtitle="Packaged products"
          close
          onBack={() => goBack(`/diary?date=${date}`)}
          right={
            scanning && hasCamera && (granted || web) ? (
              <IconButton
                testID="scan-toggle-manual"
                accessibilityLabel={manual ? 'Scan with the camera' : 'Type the barcode number'}
                onPress={() => (manual ? void startCamera() : setManual(true))}>
                {manual ? <Camera size={20} color={colors.text} /> : <Keyboard size={20} color={colors.text} />}
              </IconButton>
            ) : undefined
          }
        />
      }>
      {scanning ? (
        showCamera ? (
          <View style={{ flex: 1, gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: added.length > 0 ? spacing.md : spacing.xl }}>
            <View style={{ flex: 1, ...cup(radius.card), overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                onBarcodeScanned={onScanned}
                onMountError={(e) => setMountError(e.message || 'The camera could not start.')}
              />
              {found ? null : <Viewfinder />}
              {found ? <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md }}>{resultCard}</View> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', display: found ? 'none' : 'flex' }}>
              {!web ? (
                <IconButton testID="scan-torch" size={52} tone={torch ? 'primary' : 'surface'} accessibilityLabel={torch ? 'Turn the light off' : 'Turn the light on'} onPress={() => setTorch((t) => !t)}>
                  {torch ? <Flashlight size={22} color={colors.onPrimary} /> : <FlashlightOff size={22} color={colors.text} />}
                </IconButton>
              ) : null}
              <Button testID="scan-type-instead" title="Type the number" variant="secondary" size="md" style={{ flex: 1 }} icon={<Keyboard size={18} color={colors.text} />} onPress={() => setManual(true)} />
            </View>
          </View>
        ) : (
          <>
            {!manual && !granted && !web ? (
              <PermissionCard
                canAsk={permission?.canAskAgain !== false}
                loading={!permission}
                onAllow={() => void startCamera()}
              />
            ) : null}
            {mountError ? (
              <Card style={{ gap: spacing.sm }}>
                <Text variant="title">The camera could not start</Text>
                <Text variant="body" color="textSecondary">
                  {mountError} You can type the number printed under the barcode instead.
                </Text>
              </Card>
            ) : null}
            {resultCard}
            <ManualEntry key={manualKey} onLookup={(code) => void lookup(code)} autoFocus={manual && !found} />
            {cameraOffer && manual ? (
              <Button testID="scan-use-camera" title={web ? 'Scan with your camera' : 'Back to the camera'} variant="ghost" icon={<Camera size={18} color={colors.primary} strokeWidth={2.2} />} onPress={() => void startCamera()} />
            ) : null}
            {web && !hasCamera ? (
              <Text variant="caption" color="textTertiary" align="center">
                No camera found in this browser. On a phone, the HealthCal app scans barcodes with the camera.
              </Text>
            ) : null}
          </>
        )
      ) : null}

      {phase.kind === 'looking' ? (
        <Card testID="scan-looking" style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="title">Looking up the product</Text>
          <Text variant="label" color="textSecondary" tabular>
            {phase.code}
          </Text>
        </Card>
      ) : null}

      {phase.kind === 'not_found' || phase.kind === 'incomplete' ? (
        <Card testID={`scan-${phase.kind}`} style={{ gap: spacing.md }}>
          <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
            {phase.kind === 'not_found' ? <PackageX size={28} color={colors.text} strokeWidth={1.9} /> : <PackageSearch size={28} color={colors.text} strokeWidth={1.9} />}
          </View>
          <Text variant="h3">{phase.kind === 'not_found' ? 'Product not found' : 'Nutrition data is incomplete'}</Text>
          <Text variant="body" color="textSecondary">
            {phase.kind === 'not_found'
              ? `Barcode ${phase.code} is not in Open Food Facts yet. Add it once from the label and it will be in your foods next time.`
              : `${isolateRtl(phase.name)} is in Open Food Facts, but its nutrition values are missing or do not add up, so it cannot be logged as it is. Add it from the label instead.`}
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            <Button
              testID="scan-create-food"
              title="Create this food"
              size="md"
              onPress={() => router.replace(`/food/custom?barcode=${phase.code}&meal=${meal}&date=${date}` as never)}
            />
            <Button testID="scan-search" title="Search by name" variant="secondary" size="md" onPress={() => router.replace(`/food/search?meal=${meal}&date=${date}` as never)} />
            <Button testID="scan-again" title={manual ? 'Try another number' : 'Scan again'} variant="secondary" size="md" onPress={scanAgain} />
          </View>
        </Card>
      ) : null}

      {phase.kind === 'error' ? (
        <Card testID="scan-error" style={{ gap: spacing.md }}>
          <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
            <CloudOff size={28} color={colors.text} strokeWidth={1.9} />
          </View>
          <Text variant="h3">Could not reach the product database</Text>
          <Text variant="body" color="textSecondary">
            Check your connection and try again. Barcode {phase.code} is kept.
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            <Button testID="scan-retry" title="Try again" size="md" onPress={() => void lookup(phase.code)} />
            <Button testID="scan-search" title="Search by name" variant="secondary" size="md" onPress={() => router.replace(`/food/search?meal=${meal}&date=${date}` as never)} />
            <Button testID="scan-again" title={manual ? 'Try another number' : 'Scan again'} variant="secondary" size="md" onPress={scanAgain} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

/** Frame with corner marks and a hint, drawn over the camera. */
function Viewfinder() {
  const { colors, radius } = useTheme();
  const corner = { position: 'absolute' as const, width: 28, height: 28, borderColor: colors.cameraInk };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: '78%', aspectRatio: 1.7 }}>
        <View style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4 }]} />
        <View style={[corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4 }]} />
        <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4 }]} />
        <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4 }]} />
      </View>
      <View style={{ position: 'absolute', bottom: 20, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.overlay }}>
        {/* White on a dark scrim in every look (`cameraInk`): the camera image is not themed. */}
        <Text variant="label" color="cameraInk">
          Line the barcode up inside the frame
        </Text>
      </View>
    </View>
  );
}

function PermissionCard({ canAsk, loading, onAllow }: { canAsk: boolean; loading: boolean; onAllow: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Card testID="scan-permission" style={{ gap: spacing.md }}>
      <View style={{ width: 44, height: 44, justifyContent: 'center' }}>
        <ScanBarcode size={28} color={colors.text} strokeWidth={1.9} />
      </View>
      <Text variant="h3">Scan with your camera</Text>
      <Text variant="body" color="textSecondary">
        HealthCal uses the camera only to read the barcode on a package. Nothing is recorded or uploaded.
        {canAsk ? '' : ' Camera access is turned off for HealthCal; you can turn it on in Settings.'}
      </Text>
      {canAsk ? (
        <Button testID="scan-allow-camera" title="Allow camera" size="md" loading={loading} onPress={onAllow} />
      ) : (
        <Button testID="scan-open-settings" title="Open settings" size="md" onPress={() => void Linking.openSettings()} />
      )}
    </Card>
  );
}

function ManualEntry({ onLookup, autoFocus }: { onLookup: (code: string) => void; autoFocus?: boolean }) {
  const { colors, spacing } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [allowAnyway, setAllowAnyway] = useState(false);
  const submit = () => {
    const check = checkBarcode(value);
    if (check.ok) {
      setError(null);
      onLookup(check.code);
      return;
    }
    setError(check.message);
    // A failed check digit can be a UPC-E code or a misprint; let the person decide.
    setAllowAnyway(cleanBarcode(value).length >= 6);
  };
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Keyboard size={18} color={colors.textSecondary} />
        <Text variant="title">Type the barcode number</Text>
      </View>
      <Text variant="body" color="textSecondary">
        The digits printed under the bars, usually 8 or 13 of them.
      </Text>
      <TextField
        testID="scan-manual-input"
        value={value}
        onChangeText={(t) => {
          setValue(t.replace(/[^\d ]/g, ''));
          setError(null);
          setAllowAnyway(false);
        }}
        placeholder="e.g. 5000159484695"
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={18}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={submit}
        error={error}
        accessibilityLabel="Barcode number"
      />
      <Button testID="scan-manual-submit" title="Look up" size="md" disabled={cleanBarcode(value).length === 0} onPress={submit} />
      {allowAnyway ? (
        <Button testID="scan-manual-anyway" title="Look it up anyway" variant="ghost" size="sm" onPress={() => onLookup(cleanBarcode(value))} />
      ) : null}
    </Card>
  );
}
