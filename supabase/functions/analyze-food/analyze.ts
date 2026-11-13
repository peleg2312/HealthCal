/**
 * Food analysis with Claude. Runtime-agnostic (no Deno globals) so it can be
 * type-checked and unit-tested under Node; index.ts wires it to the HTTP edge.
 *
 * Cost design, in order of impact:
 *  1. The client downsizes the photo before upload. Vision input is billed by
 *     pixel area (about one token per 28x28 px patch), so a 768 px image costs
 *     roughly 750 input tokens instead of several thousand for a camera original.
 *  2. The smallest current model answers by default; a stronger one runs only
 *     when the user asks for a second, more careful pass.
 *  3. Structured output with a compact schema: no prose, no markdown, no retries
 *     for malformed JSON.
 *  4. A short system prompt and `effort: "low"` keep reasoning tokens small.
 */
import Anthropic from '@anthropic-ai/sdk';

export const FAST_MODEL = 'claude-haiku-5-5';
export const PRECISE_MODEL = 'claude-sonnet-5-5';

export interface AnalyzeInput {
  /** Base64 image data without a data: prefix. */
  image?: string;
  mediaType?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Typed description, or extra context for the photo ("cooked in butter", "large plate"). */
  text?: string;
  /** Run the stronger model. Costs about twenty times more per request. */
  precise?: boolean;
}

/** How much of the daily allowance one analysis uses: the careful pass weighs five fast ones. */
export const costOf = (input: Pick<AnalyzeInput, 'precise'>): number => (input.precise ? 5 : 1);

export interface AnalyzedItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number;
}

export interface AnalyzeOutput {
  dish: string;
  items: AnalyzedItem[];
  hiddenFatQuestion: string | null;
  note: string | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class AnalyzeError extends Error {
  /** Tokens the model already used before this error, when it got that far (those are billed). */
  usage?: { inputTokens: number; outputTokens: number };

  constructor(
    public code: 'bad_request' | 'not_food' | 'declined' | 'truncated' | 'rate_limited' | 'upstream',
    message: string,
    public status: number,
    usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.usage = usage;
  }

  /** True when the provider was never reached or refused before producing output, so nothing was billed. */
  get unbilled(): boolean {
    return !this.usage && (this.code === 'rate_limited' || this.code === 'upstream');
  }
}

const SYSTEM = `You estimate nutrition for a food diary from a photo and/or a short description.
List each distinct food or drink as its own item with your best estimate of the edible weight in grams as served, and its calories and macros for that weight.
Judge portions from plate, cutlery, hands and packaging for scale. Use the user's text when it gives amounts or cooking method.
Photos hide fat: include the cooking oil, butter, dressing or sauce that the dish normally contains in the relevant item instead of assuming none.
confidence is 0 to 1 for how sure you are of that item's identity and portion together.
hidden_fat_question: one short question about added fat or sauce the photo cannot show, when the answer would change the estimate by more than about 50 kcal; otherwise null.
note: at most one short sentence about what limits accuracy (for example no scale reference), or null.
If there is no food or drink, return an empty items array and say so in note. Names are short and generic, in the user's language.`;

/** Compact on purpose: every property name is output tokens on every item. */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dish', 'items', 'hidden_fat_question', 'note'],
  properties: {
    dish: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'confidence'],
        properties: {
          name: { type: 'string' },
          grams: { type: 'integer' },
          kcal: { type: 'integer' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          fiber: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    },
    hidden_fat_question: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;

const MAX_IMAGE_BASE64 = 1_400_000; // about 1 MB of image data
const MAX_TEXT = 500;
const MAX_ITEMS = 15;

export function validateInput(body: unknown): AnalyzeInput {
  if (!body || typeof body !== 'object') throw new AnalyzeError('bad_request', 'Send a JSON body.', 400);
  const b = body as Record<string, unknown>;
  const image = typeof b.image === 'string' && b.image.length > 0 ? b.image : undefined;
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, MAX_TEXT) : undefined;
  if (!image && !text) throw new AnalyzeError('bad_request', 'Send a photo, a description, or both.', 400);
  if (image && image.length > MAX_IMAGE_BASE64) {
    throw new AnalyzeError('bad_request', 'Image is too large. Resize it to about 768 px before uploading.', 413);
  }
  if (image && !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    throw new AnalyzeError('bad_request', 'Image must be base64 without a data: prefix.', 400);
  }
  const mediaType = b.mediaType === 'image/png' || b.mediaType === 'image/webp' ? b.mediaType : 'image/jpeg';
  return { image, mediaType, text: text || undefined, precise: b.precise === true };
}

const num = (v: unknown, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.min(max, Math.max(0, n));
};

/**
 * Never trust model numbers blindly: clamp to physical limits and make
 * calories agree with the macros, since a mismatch means one of them is wrong.
 */
export function sanitizeItems(raw: unknown): AnalyzedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AnalyzedItem[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const grams = Math.round(num(o.grams, 3000));
    if (!name || grams <= 0) continue;
    // Macros cannot weigh more than the food itself.
    let protein = num(o.protein, grams);
    let carbs = num(o.carbs, grams);
    let fat = num(o.fat, grams);
    const macroSum = protein + carbs + fat;
    if (macroSum > grams) {
      const f = grams / macroSum;
      protein *= f;
      carbs *= f;
      fat *= f;
    }
    const fiber = Math.min(num(o.fiber, grams), carbs);
    const atwater = protein * 4 + carbs * 4 + fat * 9;
    let kcal = num(o.kcal, grams * 9);
    // Alcohol and fibre explain small gaps; a large gap is an error, so fall back to the macros.
    if (atwater > 0 && Math.abs(kcal - atwater) > Math.max(25, atwater * 0.25)) kcal = atwater;
    if (kcal === 0 && atwater > 0) kcal = atwater;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    out.push({
      name,
      grams,
      kcal: Math.round(kcal),
      protein: round1(protein),
      carbs: round1(carbs),
      fat: round1(fat),
      fiber: round1(fiber),
      confidence: Math.round(num(o.confidence, 1) * 100) / 100,
    });
  }
  return out;
}

function userText(input: AnalyzeInput): string {
  if (input.image && input.text) return `Details from the user: ${input.text}`;
  if (input.image) return 'Estimate this meal.';
  return `Estimate this meal from the description: ${input.text}`;
}

export interface AnalyzeOptions {
  fastModel?: string;
  preciseModel?: string;
}

export async function analyzeFood(client: Anthropic, input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<AnalyzeOutput> {
  const model = input.precise ? (options.preciseModel ?? PRECISE_MODEL) : (options.fastModel ?? FAST_MODEL);
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType ?? 'image/jpeg', data: input.image } });
  }
  content.push({ type: 'text', text: userText(input) });

  const base = {
    model,
    // Reasoning counts toward this cap, so it leaves room for both; a typical answer uses 150 to 400 tokens.
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user' as const, content }],
    output_config: {
      effort: (input.precise ? 'medium' : 'low') as 'low' | 'medium',
      format: { type: 'json_schema' as const, schema: SCHEMA as unknown as Record<string, unknown> },
    },
  };

  let response: Anthropic.Message | Anthropic.Beta.BetaMessage;
  try {
    response = input.precise
      ? // The stronger model can decline a request through its safety classifiers;
        // the server-side fallback re-runs it on another model inside the same call.
        await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(base);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalyzeError('rate_limited', 'The analysis service is busy. Try again in a moment.', 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new AnalyzeError('bad_request', 'That image could not be read. Try another photo.', 400);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalyzeError('upstream', 'The analysis service is unavailable right now.', 502);
    }
    throw error;
  }

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stop_reason === 'refusal') {
    throw new AnalyzeError('declined', 'This photo could not be analysed. Try a different one or describe the meal instead.', 422, usage);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AnalyzeError('truncated', 'The meal was too complex to analyse in one go. Try a closer photo of fewer items.', 422, usage);
  }

  // Thinking blocks can come first, so find the text block by type rather than position.
  let text = '';
  for (const block of response.content) if (block.type === 'text') text += block.text;
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    parsed = value as Record<string, unknown>;
  } catch {
    throw new AnalyzeError('upstream', 'The analysis came back in an unexpected format. Try again.', 502, usage);
  }

  const items = sanitizeItems(parsed.items);
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  if (items.length === 0) {
    throw new AnalyzeError('not_food', str(parsed.note, 160) ?? 'No food was recognised. Try a clearer photo or describe the meal.', 422, usage);
  }
  return {
    dish: str(parsed.dish, 80) ?? items[0].name,
    items,
    hiddenFatQuestion: str(parsed.hidden_fat_question, 160),
    note: str(parsed.note, 160),
    model: response.model,
    usage,
  };
}
