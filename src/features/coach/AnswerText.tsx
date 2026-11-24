import React from 'react';
import { View } from 'react-native';

import { startsRtl } from '@/lib/bidi';
import { useTheme } from '@/theme';
import { FadeUp, Text } from '@/ui';

import { answerBlocks, type Block } from './format';

/** The answer's reading size: a little larger than the app's body, for a few paragraphs in a row. */
const READ = { fontSize: 16, lineHeight: 24 } as const;
/** Ruling L5: the blocks fade up 60 ms apart, the whole within 400 ms. */
const STEP_MS = 60;
const LAST_MS = 400 - 180;

/**
 * An AI answer as text to read (`answerBlocks`, ./format.ts): paragraphs 12 px apart, list rows with
 * a small square in the level line's colour (or their number), bold spans. Every piece is a string
 * drawn by `Text`: nothing is rendered as Markdown or HTML. With `arrive`, the blocks fade up one
 * after another (ruling L5); a remount or reduced motion shows them at once.
 */
export function AnswerText({ text, arrive = false }: { text: string; arrive?: boolean }) {
  const { colors, radius, spacing } = useTheme();
  const blocks = answerBlocks(text);
  const rtl = startsRtl(text);
  const dir = rtl ? ({ writingDirection: 'rtl', textAlign: 'right' } as const) : null;

  const line = (b: Block) => (
    <Text variant={b.kind === 'head' ? 'bodyStrong' : 'body'} color="text" style={[READ, dir, { flex: b.kind === 'item' ? 1 : undefined }]} selectable>
      {/* An array child: the kit adds no direction mark to it. */}
      {b.spans.map((s, i) =>
        s.strong && b.kind !== 'head' ? (
          <Text key={i} variant="bodyStrong" style={READ}>
            {[s.text]}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Text>
  );

  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((b, i) => {
        const prevItem = i > 0 && blocks[i - 1].kind === 'item' && b.kind === 'item';
        const body =
          b.kind === 'item' ? (
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              {b.marker ? (
                <Text variant="bodyStrong" color="textSecondary" style={[READ, { minWidth: 18 }]}>
                  {b.marker}
                </Text>
              ) : (
                <View style={{ width: 6, height: 6, marginTop: (READ.lineHeight - 6) / 2, marginHorizontal: 3, backgroundColor: colors.rim, borderRadius: Math.min(2, radius.chip) }} />
              )}
              {line(b)}
            </View>
          ) : (
            line(b)
          );
        return (
          <FadeUp key={i} disabled={!arrive} delay={Math.min(i * STEP_MS, LAST_MS)} style={prevItem ? { marginTop: -(spacing.md - spacing.xs) } : undefined}>
            {body}
          </FadeUp>
        );
      })}
    </View>
  );
}
