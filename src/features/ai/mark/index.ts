/**
 * The AI's own mark family, the one sanctioned exception to "lucide icons only" for the AI:
 * `AiMark` (the AI's cup with its drop, wherever the AI made something or is working), `AiGlyph`
 * (the same cup as line glyphs for buttons and tiles) and `SourceMark` (a food's data-source key,
 * the small AiMark for an AI estimate). Lucide's Sparkles, Wand, Bot and Brain are never used for the AI.
 */
export { AiMark, AI_MARK_BOX, aiMarkHeadroom, type AiMarkSize } from './AiMark';
export { AiGlyph, type AiGlyphName } from './AiGlyph';
export { SourceMark, sourceKeyVariant, sourceMarkTop } from './SourceMark';
export { aiMarkFill, coachMarkFill, dropColor, type MarkFill, type MarkPalette } from './fill';
export { startWaitLoop, waitDuration, WAIT_HIGH, WAIT_LOOP_MS, WAIT_LOW, WAIT_REST, WAIT_STILL_AFTER_MS, WAIT_TURNS } from './loop';
