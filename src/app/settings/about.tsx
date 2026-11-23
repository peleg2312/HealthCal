import {
  Activity,
  BookOpen,
  Droplets,
  Flame,
  Gauge,
  HeartPulse,
  Lock,
  Scale,
  Sparkles,
  Stethoscope,
  Target,
} from 'lucide-react-native';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { AiConsentAbout } from '@/features/ai/AiConsentAbout';
import { CoachConsentAbout } from '@/features/coach/CoachConsentAbout';
import { usePlan } from '@/features/plan/cache';
import { PlanRow } from '@/features/plan/PlanRow';
import { planVisible } from '@/features/plan/view';
import { storesRead } from '@/features/health-sync/reach';
import { IconTile } from '@/features/settings/components';
import { AboutVersion } from '@/features/updates/AboutVersion';
import { ACTIVITY_FACTORS, ACTIVITY_LABELS, calorieFloor } from '@/lib/energy';
import { formatNumber } from '@/lib/units';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { useEnergyModel } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import type { ActivityLevel } from '@/types';
import { Button, Card, Header, Screen, Text } from '@/ui';

function Section({
  icon,
  color,
  keep,
  title,
  source,
  children,
  testID,
}: {
  icon: (c: string) => React.ReactNode;
  color: string;
  /** Keep the icon in `color` (a status ink such as warningInk); otherwise the tile shows it neutral. */
  keep?: boolean;
  title: string;
  source?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { spacing } = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
        <IconTile color={color} keep={keep}>{icon(color)}</IconTile>
        <Text variant="h3" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>{children}</View>
      {source ? (
        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.md }}>
          Source: {source}
        </Text>
      ) : null}
    </Card>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="body" color="textSecondary">
      {children}
    </Text>
  );
}

function Yours({ children }: { children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    // Your own number: an alt cup (surfaceAlt, no border) with the level line down its side.
    <View style={{ backgroundColor: colors.surfaceAlt, ...cup(radius.tile, 5), borderLeftWidth: 3, borderLeftColor: colors.rim, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      <Text variant="label">{children}</Text>
    </View>
  );
}

/** Live numbers for the signed-up user; absent before onboarding. */
function useMine() {
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  return onboarded;
}

function MyResting() {
  const m = useEnergyModel(useToday());
  return (
    <Yours>
      Yours: {formatNumber(Math.round(m.bmr))} kcal at rest ({m.bmrMethod === 'katch-mcardle' ? 'lean-mass equation' : 'Mifflin-St Jeor'}), about{' '}
      {formatNumber(Math.round(m.formulaTdee))} kcal with everyday activity.
    </Yours>
  );
}

function MyTarget() {
  const m = useEnergyModel(useToday());
  return (
    <Yours>
      Yours: {formatNumber(m.target.target)} kcal a day{m.target.source === 'override' ? ', set by you' : ''}
      {m.usingAdaptive ? `, built on ${formatNumber(Math.round(m.tdee))} kcal of expenditure, a blend of your data and the equation` : ''}.
    </Yours>
  );
}

export default function AboutScreen() {
  const { colors, spacing } = useTheme();
  const mine = useMine();
  // Which stores are named comes from reach.ts (Apple Health, since adapter.ios.ts loads the library).
  const stores = storesRead();

  return (
    <Screen header={<Header title="About HealthCal" subtitle="How your numbers are calculated" />}>
      <Text variant="body" color="textSecondary">
        Every number in HealthCal comes from a published method. Here is each one in plain language, with where it comes from. All of them are
        estimates: bodies differ, and the app says so rather than showing false precision.
      </Text>

      <Section
        testID="about-resting"
        icon={(c) => <HeartPulse size={20} color={c} />}
        color={colors.protein}
        title="Resting metabolism"
        source="Mifflin et al., American Journal of Clinical Nutrition, 1990; Katch and McArdle, Nutrition, Weight Control and Exercise, 1983.">
        <P>
          What your body burns at complete rest. HealthCal uses the Mifflin-St Jeor equation, which predicts measured values best for most adults: 10
          × weight in kg + 6.25 × height in cm − 5 × age, then + 5 for men or − 161 for women.
        </P>
        <P>
          If you enter a body fat percentage between 3 and 60%, the Katch-McArdle equation is used instead: 370 + 21.6 × lean mass in kg. It fits
          muscular and very lean people better. Body fat readings are noisy, so the result is kept within 15% of the Mifflin-St Jeor value: a
          mistyped number can never swing your budget wildly.
        </P>
        {mine ? <MyResting /> : null}
      </Section>

      <Section
        icon={(c) => <Gauge size={20} color={c} />}
        color={colors.exercise}
        title="Everyday activity"
        source="Activity factors as used with the Harris-Benedict and Mifflin-St Jeor equations (FAO/WHO/UNU 2004 physical activity levels).">
        <P>Resting metabolism is multiplied by a factor for how much you move outside workouts:</P>
        <View style={{ gap: 4 }}>
          {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
              <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
                {ACTIVITY_LABELS[k].title}, {ACTIVITY_LABELS[k].hint.toLowerCase()}
              </Text>
              <Text variant="label" tabular>
                × {ACTIVITY_FACTORS[k]}
              </Text>
            </View>
          ))}
        </View>
        <P>Logged workouts are not part of this factor. They are added separately, so nothing is counted twice.</P>
      </Section>

      <Section
        icon={(c) => <Target size={20} color={c} />}
        color={colors.calories}
        title="Calorie target and the safety floor"
        source="7,700 kcal per kg of body weight change (Wishnofsky 1958, the standard approximation); pace limits from common clinical guidance.">
        <P>
          To lose or gain, your chosen weekly pace is turned into a daily difference using about 7,700 kcal per kg, then subtracted from or added to
          your expenditure. The result is rounded to 10 kcal.
        </P>
        <P>
          The pace is capped at 1% of body weight a week for loss and 0.5% for gain. The target never goes below {formatNumber(calorieFloor('female'))}{' '}
          kcal for women or {formatNumber(calorieFloor('male'))} kcal for men (or your expenditure, if that is lower). When the floor applies, HealthCal
          tells you the pace will be slower. You can always set your own number instead.
        </P>
        {mine ? <MyTarget /> : null}
      </Section>

      <Section
        icon={(c) => <Flame size={20} color={c} />}
        color={colors.protein}
        title="Protein and macros"
        source="International Society of Sports Nutrition position stand on protein (2017); Dietary Guidelines for Americans 2020-2025 for fibre.">
        <P>
          Protein is set per kg of body weight: 2.0 g when losing (to protect muscle), 1.6 g when maintaining and 1.8 g when gaining. For people
          with a higher body mass index (above 27.5) the weight at a BMI of 25 is used, and with a known body fat percentage lean mass is used, so
          targets do not overshoot. Protein stays between 15% and 40% of calories.
        </P>
        <P>
          Fat is about 28% of calories and never below 0.6 g per kg. Carbohydrates fill the rest, with at least 50 g. Fibre is 14 g per 1,000 kcal.
          You can pick a preset or your own split in Goals and targets.
        </P>
      </Section>

      <Section
        icon={(c) => <Activity size={20} color={c} />}
        color={colors.exercise}
        title="Exercise calories"
        source="2024 Adult Compendium of Physical Activities (Herrmann et al., Journal of Sport and Health Science, 2024).">
        <P>
          Each activity has a MET value from the 2024 Compendium for easy, moderate and hard effort. Calories during a session are MET × 3.5 × body
          weight in kg ÷ 200 per minute.
        </P>
        <P>
          Your daily budget already covers what you would have burned in those minutes anyway, so only the net part, above that baseline, is added
          back. Adding the gross number would count your resting burn twice, which is a common reason calorie apps overestimate. Real costs vary
          by about a fifth either way, so burns are shown with a range.
        </P>
      </Section>

      <Section
        icon={(c) => <Droplets size={20} color={c} />}
        color={colors.water}
        title="Hydration goal"
        source="EFSA Scientific Opinion on Dietary Reference Values for water (2010); US National Academies, Dietary Reference Intakes for Water (2004).">
        <P>
          The reference intakes (EFSA: 2.0 L for women and 2.5 L for men; US National Academies: 2.7 L and 3.7 L) include the 20 to 30% of water
          that comes from food. HealthCal sets a goal for drinks only: 33 ml per kg of body weight, kept between 1.6 and 3.0 L for women and 2.0 and
          3.7 L for men.
        </P>
        <P>
          Logged exercise adds 350 to 800 ml per hour depending on intensity (at most 2 L a day). Water, tea and sports drinks count fully; coffee, milk and other
          drinks count at 90%, juice at 95%.
        </P>
      </Section>

      <Section
        icon={(c) => <Scale size={20} color={c} />}
        color={colors.weight}
        title="Weight trend and adaptive expenditure"
        source="Exponentially smoothed moving average as popularised by The Hacker's Diet (Walker); least-squares line; energy balance method.">
        <P>
          Scale weight swings by a kilo (about two pounds) or more from water, salt and digestion. The trend line smooths this out: each day moves 10% of the way toward
          the new weigh-in, and gaps between weigh-ins are filled in evenly. The weekly rate of change is measured on the weigh-ins themselves: the
          slope of a straight line fitted through the last three weeks of weigh-ins, because the smoothed line is slow to show a new rate.
        </P>
        <P>
          With &quot;Learn from my data&quot; on, HealthCal fits a straight line through your weigh-ins of the last 28 days and compares its slope
          with what you ate: expenditure = average intake − rate of change (kg a day) × 7,700. Logged workouts are then taken out, because each one is
          already added to the budget, on its own day or shared over seven days, so eating back exercise calories is never counted twice. It needs at least 10 fully logged days (800 kcal or more), 5 weigh-ins and two weeks between the first
          and last. The result is blended with the equation, trusting your data more as it grows (up to 85%), and kept within 65% to 145% of the
          equation so a few missed logs cannot produce an extreme target.
        </P>
      </Section>

      <Section
        icon={(c) => <Sparkles size={20} color={c} />}
        color={colors.fat}
        title="AI food estimates"
        source="Claude vision models by Anthropic, with server-side checks.">
        <P>
          When you ask, a photo or description is analysed to identify the foods and estimate portions. Results are checked before you see them:
          macros cannot weigh more than the food, and calories must agree with the macros.
        </P>
        <P>
          Portions are hard to judge from a photo, especially oils, butter and sauces, so every AI entry shows a calorie range that widens when the
          model is less sure, and asks about hidden fats. Treat them as a starting point you can adjust.
        </P>
      </Section>

      <Section icon={(c) => <BookOpen size={20} color={c} />} color={colors.carbs} title="Where food data comes from">
        <P>
          Three sources, ranked by how much to trust them, and each food shows which one it came from. First, a bundled reference list of common
          foods, available offline, most with the values of a national food composition record: USDA FoodData Central, or Israel&apos;s national
          nutrition database (Tzameret) from the Ministry of Health, published on data.gov.il, foods updated October 2022. Second, Open Food Facts, a free community database of packaged products
          used for barcode scans; entries are checked for plausible values but are crowd-sourced, so they rank below reference data. Third, foods
          and meals you create yourself.
        </P>
      </Section>

      <Section icon={(c) => <Lock size={20} color={c} />} color={colors.success} title="Privacy" testID="about-privacy">
        <P>
          Your data stays on this device unless you create an account. With an account it is stored in your private space on HealthCal&apos;s
          server so it can sync, and no other account can read it. No ads, no tracking, no selling of data. You can export everything or delete
          it at any time.
        </P>
        <P>
          A meal photo or description leaves this device only when you ask for an AI estimate, and a question to the coach only when you send it;
          each only after you have agreed once on this device. A meal goes to HealthCal&apos;s server, which passes it to Anthropic, the maker of
          Claude, to estimate the food; nothing else from your diary goes with it. A question to the coach goes the same way with your last few
          questions and its answers, and with a summary of your week only while &quot;Share my week&quot; is on in the coach. HealthCal&apos;s server
          does not store the photo or the words, only how many analyses and questions you sent and how large they were, for the daily allowance.
          The coach chat is kept on this phone. Anthropic handles what it receives under Anthropic&apos;s terms.
        </P>
        <P>
          If you pay for Plus, the payment is handled by a payment company; HealthCal&apos;s server keeps only whether your plan is active and until
          when.
        </P>
        <P>
          With Workout sync switched on, HealthCal reads your workouts from {stores.from}: each session with its calories and its distance. They
          are stored like sessions you log by hand. It also reads your daily steps, which stay on this phone only, for 35 days, and are never
          added to your calories. And it reads how long you slept each night, kept in your sleep log like a night you enter yourself (in your
          account if you have one) and never added to your calories. With your permission it also reads your weigh-ins with body fat (kept like ones you enter), the
          calories you burn in a day (on this phone only, shown beside HealthCal&apos;s estimate and never added) and each workout&apos;s heart rate. Nothing is written back to {stores.notBack}. This data is never sent to the AI food estimate, used for ads or shared
          with anyone else; it reaches the AI coach only inside the summary of your week you choose to share there (on iPhone, never anything
          from Apple Health), and friends see only what the Friends screen says they see.
        </P>
        <AiConsentAbout />
        <CoachConsentAbout />
      </Section>

      <LegalLinks />

      <Section icon={(c) => <Stethoscope size={20} color={c} />} color={colors.warningInk} keep title="Not medical advice">
        <P>
          HealthCal is a tracking tool, not a medical device. Its numbers are estimates for healthy adults. If you are pregnant or breastfeeding,
          under 18, have diabetes, kidney disease, an eating disorder or another medical condition, talk to a doctor or registered dietitian before
          changing how you eat.
        </P>
      </Section>

      <AboutPlan />

      <AboutVersion />
    </Screen>
  );
}

/** The whole texts: the privacy page and the terms, as screens of their own. */
function LegalLinks() {
  const { spacing } = useTheme();
  return (
    <View testID="about-legal" style={{ flexDirection: 'row', gap: spacing.md }}>
      <Button testID="about-privacy-full" title="Privacy in full" variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={() => router.push('/legal/privacy' as never)} />
      <Button testID="about-terms" title="Terms of use" variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={() => router.push('/legal/terms' as never)} />
    </View>
  );
}

/** One line about the plan, while plans are on or a plan is held (ruling R14). */
function AboutPlan() {
  const view = usePlan();
  const { spacing } = useTheme();
  if (!planVisible(view)) return null;
  return (
    <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
      <PlanRow testID="about-plan" title="Your plan" />
    </Card>
  );
}
