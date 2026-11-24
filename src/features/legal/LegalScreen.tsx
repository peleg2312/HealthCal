import { router } from 'expo-router';
import { ArrowUp, Cloud, Download, EyeOff, RefreshCw, Smartphone, Stethoscope, UserRound, type LucideIcon } from 'lucide-react-native';
import React, { useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, useWindowDimensions, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { AiMark, aiMarkHeadroom } from '@/features/ai/mark';
import { lastWordsTogether } from '@/features/auth/lines';
import { MAX_CONTENT_WIDTH, useReducedMotion, useTheme } from '@/theme';
import { Button, Card, Divider, Header, ListRow, PressableScale, Screen, Text } from '@/ui';

import { contactLine, jumpLabel, LEGAL_DOCUMENTS, updatedLine, type LegalDocument } from './content';
import { jumpLines, jumpWidth } from './jumpLines';

/** The screen's own words (the pages' words are ./content.ts). */
const IN_SHORT = 'In short';
const FULL_APPLIES: Record<LegalDocument['id'], string> = {
  terms: 'The full terms below are what applies.',
  privacy: 'The full page below says it in detail.',
};
const ON_THIS_PAGE = 'On this page';
const BACK_TO_TOP = 'Back to top';

/** The mark of each line of the short layer, by its id. The AI's line wears the AI's own mark, never a lucide icon. */
const SUMMARY_ICONS: Record<LegalDocument['id'], Record<string, LucideIcon | 'ai'>> = {
  terms: { medical: Stethoscope, free: Smartphone, plus: RefreshCw, yours: Download, age: UserRound },
  privacy: { device: Smartphone, account: Cloud, ads: EyeOff, ai: 'ai', yours: Download },
};

/** A summary mark's slot: 20 px wide, its 20 px mark centred on the first line of body text (21 px). */
const MARK = 20;

/**
 * One legal page (`/legal/terms`, `/legal/privacy`) in three layers, so it is read instead of scrolled past:
 *
 * 1. "In short": a card of a few plain lines with the date (`legal-<doc>-summary`; on the privacy page it
 *    carries `legal-privacy-short` and stands for the text's own "In short" section, which is not drawn twice).
 * 2. "On this page": one chip per section, two or three to a line (./jumpLines.ts), wearing the section's
 *    short jump label where its heading is long (`jumpLabel`; the heading itself is never shortened, and a
 *    screen reader hears the whole heading). A tap scrolls there and moves a screen reader to its heading.
 * 3. The full text as one calm reading column: no card around each section, the body in the text colour,
 *    a line between sections. It is what applies. Then the other page, the contact line once the owner
 *    has set an address, and "Back to top".
 *
 * The words are ./content.ts; this only places them. Open without a profile (src/app/_layout.tsx), since
 * these are also the public pages a payment company, a store and Google sign-in link to.
 */
export function LegalScreen({ doc }: { doc: LegalDocument }) {
  const { colors, spacing, radius } = useTheme();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const other = doc.id === 'terms' ? LEGAL_DOCUMENTS.privacy : LEGAL_DOCUMENTS.terms;
  const contact = contactLine();
  // The privacy text's own "In short" is the card at the top.
  const sections = doc.sections.filter((s) => !(doc.id === 'privacy' && s.id === 'short'));
  // The page's own scroll area, handed over the way onboarding and the photo review do (Screen's scrollProps).
  const scroll = useRef<ScrollViewInstance>(null);
  // Where the reading column and each section start, from layout; read only when a chip is tapped.
  const columnY = useRef(0);
  const sectionY = useRef<Record<string, number>>({});
  const headings = useRef<Record<string, unknown>>({});

  const room = Math.min(width, MAX_CONTENT_WIDTH) - 2 * spacing.xl;
  const lines = jumpLines(
    sections.map((s) => jumpWidth(jumpLabel(s), room)),
    room,
  );

  const focusHeading = (id: string) => {
    const node = headings.current[id];
    if (!node) return;
    if (Platform.OS === 'web') {
      (node as { focus?: (o?: { preventScroll?: boolean }) => void }).focus?.({ preventScroll: true });
      return;
    }
    const tag = findNodeHandle(node as React.Component);
    if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
  };

  const jump = (id: string) => {
    const y = sectionY.current[id];
    if (y === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, columnY.current + y - spacing.sm), animated: !reduce });
    focusHeading(id);
  };

  const narrow = width < 360;
  const updated = (
    <Text variant="caption" color="textSecondary" testID={`legal-${doc.id}-updated`}>
      {updatedLine()}
    </Text>
  );

  return (
    <Screen header={<Header title={doc.title} subtitle={doc.subtitle} />} testID={`legal-${doc.id}`} scrollProps={{ ref: scroll } as ScrollViewProps}>
      <Card tone="alt" testID={doc.id === 'privacy' ? 'legal-privacy-short' : `legal-${doc.id}-summary`} style={{ gap: spacing.md }}>
        {/* Under 360 px the date takes its own line, so the overline never shares one with it. */}
        <View style={narrow ? { gap: spacing.xs } : { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
          <Text variant="overline" accessibilityRole="header">
            {IN_SHORT}
          </Text>
          {updated}
        </View>
        {doc.summary.map((item) => {
          const Icon = SUMMARY_ICONS[doc.id][item.id];
          return (
            <View key={item.id} testID={`legal-${doc.id}-summary-${item.id}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ width: MARK, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {Icon === 'ai' ? (
                  // The cup stands where an icon would; its drop rises above the line.
                  <AiMark size="row" style={{ marginTop: -aiMarkHeadroom('row') }} />
                ) : Icon ? (
                  <Icon size={MARK} color={colors.text} strokeWidth={1.9} />
                ) : null}
              </View>
              {/* The last two words stay together, so a line never ends on one word alone at any width. */}
              <Text variant="body" style={{ flex: 1 }} accessibilityLabel={item.text}>
                {lastWordsTogether(item.text)}
              </Text>
            </View>
          );
        })}
        <Text variant="caption" color="textSecondary">
          {FULL_APPLIES[doc.id]}
        </Text>
      </Card>

      <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
        <Text variant="overline">{ON_THIS_PAGE}</Text>
        {/* Lines 12 apart and chips 8 apart, so two chips' touch areas meet in the gap; two or three chips to a line. */}
        <View style={{ rowGap: 12 }}>
          {lines.map((line) => (
            <View key={line.join('|')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }}>
              {line.map((i) => {
                const s = sections[i];
                return (
                  <PressableScale
                    key={s.id}
                    testID={`legal-${doc.id}-jump-${s.id}`}
                    onPress={() => jump(s.id)}
                    feedback="select"
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="link"
                    accessibilityLabel={`Go to ${s.heading}`}
                    style={{ height: 32, maxWidth: '100%', paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.chip, borderWidth: 1, borderColor: colors.borderStrong }}>
                    <Text variant="label" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
                      {jumpLabel(s)}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* The full text: one reading column, a line between sections. */}
      <View onLayout={(e) => (columnY.current = e.nativeEvent.layout.y)} style={{ marginTop: spacing.sm }}>
        <Text variant="body">{doc.intro}</Text>
        {sections.map((s) => (
          <React.Fragment key={s.id}>
            <View style={{ marginVertical: spacing.xxl }}>
              <Divider />
            </View>
            <View testID={`legal-${doc.id}-${s.id}`} onLayout={(e) => (sectionY.current[s.id] = e.nativeEvent.layout.y)} style={{ gap: spacing.sm }}>
              <Text
                variant="h3"
                accessibilityRole="header"
                // The kit's Text hands unknown props to the platform's: the heading can be given focus after a jump.
                {...({ ref: (node: unknown) => void (headings.current[s.id] = node), tabIndex: -1 } as object)}
                style={Platform.OS === 'web' ? { outlineWidth: 0 } : undefined}>
                {s.heading}
              </Text>
              {s.paragraphs.map((p, i) => (
                <Text key={i} variant="body">
                  {p}
                </Text>
              ))}
            </View>
          </React.Fragment>
        ))}
      </View>

      <Card padding={0} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <ListRow
          testID={`legal-${doc.id}-other`}
          title={other.title}
          subtitle={other.subtitle}
          accessibilityRole="link"
          onPress={() => router.push(`/legal/${other.id}` as never)}
        />
      </Card>
      {contact ? (
        <Text variant="caption" color="textSecondary" testID={`legal-${doc.id}-contact`} selectable>
          {contact}
        </Text>
      ) : null}
      <Button
        title={BACK_TO_TOP}
        variant="ghost"
        size="sm"
        full={false}
        testID={`legal-${doc.id}-top`}
        icon={<ArrowUp size={16} color={colors.primaryInk} strokeWidth={2.2} />}
        style={{ alignSelf: 'center' }}
        onPress={() => scroll.current?.scrollTo({ y: 0, animated: !reduce })}
      />
    </Screen>
  );
}
