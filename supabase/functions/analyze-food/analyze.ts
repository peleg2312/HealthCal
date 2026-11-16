/**
 * Food analysis with Claude. Runtime-agnostic (no Deno globals) so it can be
 * type-checked and unit-tested under Node; index.ts wires it to the HTTP edge.
 *
 * Cost design, in order of impact:
 *  1. The client downsizes the photo before upload. Vision input is billed by
 *     pixel area (one token per 28x28 px patch), so a 768 px image costs 300 to
 *     800 input tokens instead of several thousand for a camera original.
 *  2. The smallest current model answers by default; a stronger one runs only
 *     when the user asks for a second, more careful pass.
 *  3. The answer is a few plain lines (`I name | grams | kcal | ...`), not JSON: a
 *     third of the output tokens, and no schema to send with every request, which
 *     together are more than half of what an analysis costs. An answer that does
 *     not keep the form is asked for once more as schema-checked JSON, so a reply
 *     always parses.
 *  4. A short system prompt and `effort: "low"` keep reasoning tokens small.
 *
 * Measured, not assumed: scripts/ops/eval-food-ai.mjs runs this file against the
 * API on typed meals and photos and prints tokens, cost and how many estimates
 * land inside their accepted range. Run it after changing SYSTEM, SCHEMA, the
 * model or the effort (the README has the last figures and what was tried).
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

/** How to estimate: the same whichever form the answer takes. */
const GUIDE = `You estimate nutrition for a food diary from a photo and/or a short description.
List each distinct food or drink as its own item with your best estimate of the edible weight in grams as served, and its calories and macros for that weight.
Judge portions from plate, cutlery, hands and packaging for scale. Use the user's text when it gives amounts or cooking method.
Photos hide fat: give each fried, sautéed, dressed or sauced item the calories it has as normally cooked or served, fat included. Fold that fat into the item's own numbers; list oil, butter or dressing as its own item only when you can see it or the user names it.
Names are short and generic, in the user's language.`;

/** The usual answer: plain lines, parsed by `parseLines`. */
const SYSTEM_LINES = `${GUIDE}
Reply with these lines and nothing else:
D <name of the dish>
I <item name> | <grams> | <kcal> | <protein g> | <carbs g> | <fat g> | <fiber g> | <confidence>
Q <question>
N <note>
One I line per item, with plain numbers after the name and no units. confidence is 0 to 1 for how sure you are of that item's identity and portion together.
Q is one short question about added fat or sauce the photo cannot show, only when the answer would change the estimate by more than about 50 kcal; leave the line out otherwise.
N is at most one short sentence about what limits accuracy (for example no scale reference); leave the line out when nothing does.
If there is no food or drink, write no I line and say so in N.`;

/** The second try, when the lines did not parse: the same guidance, answered as schema-checked JSON. */
const SYSTEM_JSON = `${GUIDE}
confidence is 0 to 1 for how sure you are of that item's identity and portion together.
hidden_fat_question: one short question about added fat or sauce the photo cannot show, when the answer would change the estimate by more than about 50 kcal; otherwise null.
note: at most one short sentence about what limits accuracy (for example no scale reference), or null.
If there is no food or drink, return an empty items array and say so in note.`;

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

/** What an answer says before its numbers are checked. */
interface RawAnswer {
  dish: string | null;
  items: unknown[];
  hidden_fat_question: string | null;
  note: string | null;
}

/** A number as written in a column: "110", "110 g", "0,9", "1,200". NaN when there is none. */
function column(cell: string | undefined): number {
  if (cell === undefined) return NaN;
  // A comma before exactly three digits groups thousands; any other comma is a decimal comma.
  const plain = cell.replace(/(\d),(?=\d{3}(\D|$))/g, '$1').replace(',', '.');
  const m = /\d+(\.\d+)?/.exec(plain);
  return m ? Number(m[0]) : NaN;
}

const blank = (text: string): string | null => (/^(-+|–|—|none|null|n\/a)\.?$/i.test(text) ? null : text);

/**
 * Reads the plain-lines answer (see SYSTEM_LINES). Null when the text does not keep the form:
 * no line of it at all, an item without a name, a weight and calories, or neither an item
 * nor a note. The caller then asks again as JSON, so nothing is ever guessed from a broken line.
 */
export function parseLines(text: string): RawAnswer | null {
  const answer: RawAnswer = { dish: null, items: [], hidden_fat_question: null, note: null };
  let seen = false;
  for (const line of text.split('\n')) {
    const m = /^\s*([DIQN])[ \t:]+(.*\S)\s*$/.exec(line);
    if (!m) continue;
    seen = true;
    const rest = m[2];
    if (m[1] === 'D') answer.dish = blank(rest);
    else if (m[1] === 'Q') answer.hidden_fat_question = blank(rest);
    else if (m[1] === 'N') answer.note = blank(rest);
    else {
      const [name, ...cells] = rest.split('|').map((c) => c.trim());
      const n = cells.map(column);
      if (!name || !(n[0] > 0) || !(n[1] >= 0)) return null;
      const or = (v: number | undefined, fallback: number) => (v === undefined || Number.isNaN(v) ? fallback : v);
      answer.items.push({ name, grams: n[0], kcal: n[1], protein: or(n[2], 0), carbs: or(n[3], 0), fat: or(n[4], 0), fiber: or(n[5], 0), confidence: or(n[6], 0.5) });
    }
  }
  if (!seen || (answer.items.length === 0 && !answer.note)) return null;
  return answer;
}

/** Either form of answer: JSON when the text is an object, the plain lines otherwise. */
export function parseAnswer(text: string): RawAnswer | null {
  if (!text.trimStart().startsWith('{')) return parseLines(text);
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    return { dish: str(o.dish), items: Array.isArray(o.items) ? o.items : [], hidden_fat_question: str(o.hidden_fat_question), note: str(o.note) };
  } catch {
    return null;
  }
}

function userText(input: AnalyzeInput): string {
  if (input.image && input.text) return `Details from the user: ${input.text}`;
  if (input.image) return 'Estimate this meal.';
  return `Estimate this meal from the description: ${input.text}`;
}

export interface AnalyzeOptions {
  fastModel?: string;
  preciseModel?: string;
  /** 'json' asks for schema-checked JSON straight away (about a fifth dearer); the default is the plain lines. */
  format?: 'lines' | 'json';
  /**
   * 'off' switches the small model's thinking off: about 40% cheaper again, and measurably less
   * accurate (in the last run 54 of 60 typed meals inside their range instead of 59). The careful
   * pass always thinks.
   */
  thinking?: 'off';
}

export async function analyzeFood(client: Anthropic, input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<AnalyzeOutput> {
  const model = input.precise ? (options.preciseModel ?? PRECISE_MODEL) : (options.fastModel ?? FAST_MODEL);
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType ?? 'image/jpeg', data: input.image } });
  }
  content.push({ type: 'text', text: userText(input) });
  const effort = (input.precise ? 'medium' : 'low') as 'low' | 'medium';

  const usage = { inputTokens: 0, outputTokens: 0 };
  /** One request in one answer form. Returns the answer's text; what it used is added to `usage`. */
  const ask = async (format: 'lines' | 'json'): Promise<string> => {
    const base = {
      model,
      // Reasoning counts toward this cap, so it leaves room for both; a typical answer uses 60 to 400 tokens.
      max_tokens: 2000,
      ...(options.thinking === 'off' && !input.precise ? { thinking: { type: 'disabled' as const } } : null),
      system: format === 'lines' ? SYSTEM_LINES : SYSTEM_JSON,
      messages: [{ role: 'user' as const, content }],
      output_config:
        format === 'lines'
          ? { effort }
          : { effort, format: { type: 'json_schema' as const, schema: SCHEMA as unknown as Record<string, unknown> } },
    };
    let response: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      response = input.precise
        ? // The stronger model can decline a request through its safety classifiers;
          // the server-side fallback re-runs it on another model inside the same call.
          await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(base);
    } catch (error) {
      // What an earlier request of this analysis used is still billed: pass it on.
      const spent = usage.inputTokens + usage.outputTokens > 0 ? { ...usage } : undefined;
      if (error instanceof Anthropic.RateLimitError) {
        throw new AnalyzeError('rate_limited', 'The analysis service is busy. Try again in a moment.', 429, spent);
      }
      if (error instanceof Anthropic.BadRequestError) {
        throw new AnalyzeError('bad_request', 'That image could not be read. Try another photo.', 400, spent);
      }
      if (error instanceof Anthropic.APIError) {
        throw new AnalyzeError('upstream', 'The analysis service is unavailable right now.', 502, spent);
      }
      throw error;
    }
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    servedBy = response.model;
    if (response.stop_reason === 'refusal') {
      throw new AnalyzeError('declined', 'This photo could not be analysed. Try a different one or describe the meal instead.', 422, { ...usage });
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AnalyzeError('truncated', 'The meal was too complex to analyse in one go. Try a closer photo of fewer items.', 422, { ...usage });
    }
    // Thinking blocks can come first, so find the text block by type rather than position.
    let text = '';
    for (const block of response.content) if (block.type === 'text') text += block.text;
    return text;
  };

  let servedBy = model;
  let parsed = options.format === 'json' ? null : parseAnswer(await ask('lines'));
  // The lines did not keep their form (rare): ask once more, this time held to the schema.
  if (!parsed) parsed = parseAnswer(await ask('json'));
  if (!parsed) throw new AnalyzeError('upstream', 'The analysis came back in an unexpected format. Try again.', 502, { ...usage });

  const items = sanitizeItems(parsed.items);
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  if (items.length === 0) {
    throw new AnalyzeError('not_food', str(parsed.note, 160) ?? 'No food was recognised. Try a clearer photo or describe the meal.', 422, { ...usage });
  }
  return {
    dish: str(parsed.dish, 80) ?? items[0].name,
    items,
    hiddenFatQuestion: str(parsed.hidden_fat_question, 160),
    note: str(parsed.note, 160),
    model: servedBy,
    usage,
  };
}

/**
 * The mailbox an address delivers to: lower case, without a "+tag", and for Gmail
 * without dots. alex+1@gmail.com and a.lex@gmail.com are the same person's inbox and
 * share one allowance.
 */
export function mailboxOf(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at).split('+')[0];
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}
