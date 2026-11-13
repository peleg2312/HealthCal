import { Info, Ruler } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { BMI_LABELS, bmi, bmiCategory, ffmi, healthyWeightRangeKg, navyBodyFatPct, waistToHeight } from '@/lib/body';
import { formatDayLabel, today } from '@/lib/dates';
import { isPlausibleBodyFat, leanMassKg } from '@/lib/energy';
import { formatHeight, lengthToCm, lengthUnit, lengthValue, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { saveWeightRecord } from '@/features/trackers/actions';
import { Figure, Note, RequireProfile } from '@/features/trackers/components';
import { findByDate, hasMeasurements, keepOrConvert, NAVY_ERROR_PCT, WHTR_GUIDELINE } from '@/features/trackers/helpers';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Badge, Button, Card, Divider, EmptyState, haptic, Header, ListRow, NumberField, Screen, SectionTitle, Text, toast, ToggleRow } from '@/ui';

function w1(kg: number, units: UnitSystem) {
  return `${weightValue(kg, units).toFixed(1)} ${weightUnit(units)}`;
}

function len(cm: number | undefined, units: UnitSystem): string {
  return cm ? `${lengthValue(cm, units).toFixed(units === 'imperial' ? 1 : 0)}` : '–';
}

/** Horizontal scale with coloured zones and a marker, for BMI and waist-to-height. */
function ZoneScale({ min, max, zones, value, testID }: { min: number; max: number; zones: { to: number; color: string }[]; value: number; testID?: string }) {
  const { colors } = useTheme();
  const pos = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const starts = zones.map((_, i) => (i === 0 ? min : zones[i - 1].to));
  return (
    <View testID={testID} style={{ height: 22, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        {zones.map((z, i) => {
          const width = (Math.min(z.to, max) - starts[i]) / (max - min);
          return <View key={i} style={{ flex: width, backgroundColor: z.color }} />;
        })}
      </View>
      <View
        style={{
          position: 'absolute',
          left: `${pos * 100}%`,
          marginLeft: -9,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.text,
          borderWidth: 3,
          borderColor: colors.surface,
        }}
      />
    </View>
  );
}

function ScaleLabels({ min, max, ticks }: { min: number; max: number; ticks: number[] }) {
  return (
    <View style={{ height: 16, marginTop: -6 }}>
      {ticks.map((t) => (
        <Text
          key={t}
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ position: 'absolute', width: 40, marginLeft: -20, left: `${((t - min) / (max - min)) * 100}%` }}>
          {String(t)}
        </Text>
      ))}
    </View>
  );
}

function BodyScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const units = profile.units;
  const weights = useLive('weights');
  const date = today();
  const todays = findByDate(weights, date);
  const measured = [...weights].filter(hasMeasurements).sort((a, b) => b.date.localeCompare(a.date));
  const lastMeasured = measured[0];
  const female = profile.sex === 'female';
  const unit = lengthUnit(units);

  const toDisplayLength = (cm: number) => Math.round(lengthValue(cm, units) * 10) / 10;
  const toInput = (cm?: number) => (cm ? toDisplayLength(cm) : null);
  const [neck, setNeck] = useState<number | null>(() => toInput(lastMeasured?.neckCm));
  const [waist, setWaist] = useState<number | null>(() => toInput(lastMeasured?.waistCm));
  const [hip, setHip] = useState<number | null>(() => toInput(lastMeasured?.hipCm));
  const toWeightInput = (kg: number) => Math.round(weightValue(kg, units) * 10) / 10;
  const [weightIn, setWeightIn] = useState<number | null>(() => toWeightInput(todays?.kg ?? profile.weightKg));
  const [weightError, setWeightError] = useState<string | null>(null);
  const [useEstimate, setUseEstimate] = useState(true);

  // Untouched prefilled fields keep the stored cm, so re-saving in inches does not drift them.
  const toCm = (v: number) => lengthToCm(v, units);
  const neckCm = (neck ? keepOrConvert(neck, lastMeasured?.neckCm, toDisplayLength, toCm) : 0) ?? 0;
  const waistCm = (waist ? keepOrConvert(waist, lastMeasured?.waistCm, toDisplayLength, toCm) : 0) ?? 0;
  const hipCm = (hip ? keepOrConvert(hip, lastMeasured?.hipCm, toDisplayLength, toCm) : 0) ?? 0;
  const estimate = neckCm && waistCm ? navyBodyFatPct({ sex: profile.sex, heightCm: profile.heightCm, neckCm, waistCm, hipCm: hipCm || undefined }) : null;
  const missing = !neck || !waist || (female && !hip);

  const weightKg = todays?.kg ?? profile.weightKg;
  const bmiValue = bmi(weightKg, profile.heightCm);
  const cat = bmiCategory(bmiValue);
  const [lo, hi] = healthyWeightRangeKg(profile.heightCm);
  const bf = isPlausibleBodyFat(profile.bodyFatPct) ? profile.bodyFatPct : null;
  const lean = bf !== null ? leanMassKg(weightKg, bf) : null;
  const ffmiValue = bf !== null ? ffmi(weightKg, profile.heightCm, bf) : null;
  const whtrWaist = waistCm || lastMeasured?.waistCm || 0;
  const whtr = whtrWaist ? waistToHeight(whtrWaist, profile.heightCm) : null;

  const canSave = !!(neck || waist || hip);
  const save = () => {
    const kg = todays?.kg ?? keepOrConvert(weightIn, profile.weightKg, toWeightInput, (v) => weightToKg(v, units)) ?? 0;
    if (!(kg >= 20 && kg <= 400)) {
      const message =
        weightIn === null || weightIn <= 0
          ? 'Enter today’s weight to save measurements'
          : `Enter a weight between ${weightValue(20, units).toFixed(0)} and ${weightValue(400, units).toFixed(0)} ${weightUnit(units)}`;
      setWeightError(message);
      // The field can sit above the fold when the footer button is tapped.
      haptic.warn();
      toast(message);
      return;
    }
    saveWeightRecord(
      date,
      {
        kg: Math.round(kg * 100) / 100,
        ...(neckCm ? { neckCm: Math.round(neckCm * 10) / 10 } : {}),
        ...(waistCm ? { waistCm: Math.round(waistCm * 10) / 10 } : {}),
        ...(hipCm ? { hipCm: Math.round(hipCm * 10) / 10 } : {}),
        ...(estimate !== null && useEstimate ? { bodyFatPct: estimate } : {}),
      },
      { message: estimate !== null && useEstimate ? `Saved, body fat set to ${estimate}%` : 'Measurements saved' },
    );
  };

  const footer = <Button testID="body-save" title="Save measurements" disabled={!canSave} onPress={save} />;

  return (
    <Screen header={<Header title="Body" subtitle={`${formatHeight(profile.heightCm, units)} · ${w1(weightKg, units)}`} />} footer={footer} backdrop={colors.weight} testID="body-screen">
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text variant="overline" color="textSecondary">
              BMI
            </Text>
            <Text testID="body-bmi" variant="numL" tabular>
              {bmiValue.toFixed(1)}
            </Text>
          </View>
          <Badge label={BMI_LABELS[cat]} color={cat === 'healthy' ? colors.success : colors.textSecondary} />
        </View>
        <ZoneScale
          testID="body-bmi-scale"
          min={15}
          max={35}
          value={bmiValue}
          zones={[
            { to: 18.5, color: colors.track },
            { to: 25, color: `${colors.success}88` },
            { to: 30, color: colors.track },
            { to: 35, color: colors.track },
          ]}
        />
        <ScaleLabels min={15} max={35} ticks={[18.5, 25, 30]} />
        <Text variant="body">
          Healthy range for your height: <Text variant="bodyStrong">{`${weightValue(lo, units).toFixed(0)}–${weightValue(hi, units).toFixed(0)} ${weightUnit(units)}`}</Text>
        </Text>
        <Note icon={<Info size={14} color={colors.textTertiary} />}>
          BMI only compares weight with height. It cannot tell muscle from fat, so muscular people often read above the range. Waist size and body fat say more.
        </Note>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="overline" color="textSecondary">
          BODY FAT AND LEAN MASS
        </Text>
        {bf !== null && lean !== null && ffmiValue !== null ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure testID="body-fat" value={bf.toFixed(1)} unit="%" label="Body fat" color="weight" />
              <Figure value={weightValue(lean, units).toFixed(1)} unit={weightUnit(units)} label="Lean mass" />
              <Figure value={ffmiValue.toFixed(1)} label="FFMI" />
            </View>
            <Text variant="caption" color="textSecondary">
              Lean mass is everything that is not fat: muscle, bone, organs and water. FFMI is lean mass for your height; most adults sit between about 15 and 22. Your calorie and protein targets use lean mass when body fat is known.
            </Text>
          </>
        ) : (
          <Text variant="body" color="textSecondary">
            Add a body fat reading from a smart scale on the weight screen, or estimate it with a tape measure below. With it, the app shows lean mass and uses it for more accurate targets.
          </Text>
        )}
      </Card>

      <SectionTitle title="Tape measure estimate" />
      <Card style={{ gap: spacing.md }}>
        <Note icon={<Ruler size={14} color={colors.textTertiary} />}>
          Measure on bare skin, tape snug but not pressing. Neck just below the Adam’s apple; waist at the navel{female ? ' (or the narrowest point)' : ''}; hips at the widest point.
        </Note>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="body-neck-input" style={{ flex: 1 }} label="Neck" suffix={unit} value={neck} onChange={setNeck} />
          <NumberField testID="body-waist-input" style={{ flex: 1 }} label="Waist" suffix={unit} value={waist} onChange={setWaist} />
          <NumberField testID="body-hip-input" style={{ flex: 1 }} label={female ? 'Hips' : 'Hips (opt.)'} suffix={unit} value={hip} onChange={setHip} />
        </View>
        {todays ? null : (
          <NumberField
            testID="body-weight-input"
            label="Today’s weight"
            suffix={weightUnit(units)}
            value={weightIn}
            onChange={(n) => {
              setWeightIn(n);
              setWeightError(null);
            }}
            error={weightError}
            hint="No weigh-in today yet. Measurements are saved with today’s weight."
          />
        )}
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: spacing.lg, gap: 4 }}>
          {estimate !== null ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text testID="body-estimate" variant="numL" tabular color="weight">
                  {estimate.toFixed(1)}
                </Text>
                <Text variant="title" color="textSecondary">
                  % body fat
                </Text>
              </View>
              <Text variant="caption" color="textSecondary">
                Likely between {Math.max(2, estimate - NAVY_ERROR_PCT).toFixed(0)} and {(estimate + NAVY_ERROR_PCT).toFixed(0)}%. The US Navy tape method is usually within 3 to 4 percentage points of a lab scan, so use it to follow change over time.
              </Text>
            </>
          ) : (
            <Text testID="body-estimate-missing" variant="body" color="textSecondary">
              {missing
                ? `Enter neck and waist${female ? ' and hips' : ''} to estimate body fat.`
                : 'These measurements do not give a valid estimate. Check that the waist is larger than the neck.'}
            </Text>
          )}
        </View>
        {estimate !== null ? (
          <ToggleRow
            testID="body-use-estimate"
            title="Use as my body fat"
            subtitle="Saves it to your profile and today’s weigh-in"
            value={useEstimate}
            onChange={setUseEstimate}
          />
        ) : null}
      </Card>

      <SectionTitle title="Waist to height" />
      <Card style={{ gap: spacing.md }}>
        {whtr !== null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text testID="body-whtr" variant="numL" tabular>
                {whtr.toFixed(2)}
              </Text>
              <Badge label={whtr < WHTR_GUIDELINE ? 'Under 0.5' : 'At or above 0.5'} color={whtr < WHTR_GUIDELINE ? colors.success : colors.textSecondary} />
            </View>
            <ZoneScale
              testID="body-whtr-scale"
              min={0.35}
              max={0.7}
              value={whtr}
              zones={[
                { to: WHTR_GUIDELINE, color: `${colors.success}88` },
                { to: 0.7, color: colors.track },
              ]}
            />
            <ScaleLabels min={0.35} max={0.7} ticks={[0.4, 0.5, 0.6]} />
          </>
        ) : null}
        <Text variant="caption" color="textSecondary">
          A simple guideline: keep your waist under half your height (a ratio under 0.5). It reflects fat around the middle, which BMI misses.
          {whtr === null ? ' Enter a waist measurement above to see yours.' : ''}
        </Text>
      </Card>

      <SectionTitle title="Measurement history" />
      <Card padding={measured.length ? spacing.md : spacing.lg}>
        {measured.length === 0 ? (
          <EmptyState emoji="📏" title="No measurements yet" message="Saved tape measurements appear here, so you can see your waist change even when the scale stalls." />
        ) : (
          measured.map((e, i) => (
            <React.Fragment key={e.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`body-history-${i}`}
                title={formatDayLabel(e.date)}
                subtitle={`Waist ${len(e.waistCm, units)} · Neck ${len(e.neckCm, units)} · Hips ${len(e.hipCm, units)} ${unit}`}
                value={isPlausibleBodyFat(e.bodyFatPct) ? `${e.bodyFatPct}%` : w1(e.kg, units)}
              />
            </React.Fragment>
          ))
        )}
      </Card>
    </Screen>
  );
}

export default function BodyRoute() {
  return (
    <RequireProfile>
      <BodyScreen />
    </RequireProfile>
  );
}
