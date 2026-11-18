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
 *  3. A typed description is answered in a few plain lines (`I name | grams | kcal
 *     | ...`): no schema to send, about a tenth cheaper. The lines are read strictly,
 *     and an answer that does not keep the form is asked for once more as
 *     schema-checked JSON, so nothing is guessed. A photo is answered as
 *     schema-checked JSON from the start, which measured more accurate there for
 *     the same money.
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
    // A photo the provider cannot read (bad_request) keeps its unit although nothing was billed:
    // the daily allowance is also what bounds junk sent on purpose.
    return !this.usage && (this.code === 'rate_limited' || this.code === 'upstream');
  }
}

/** How to estimate: the same whichever form the answer takes. */
const GUIDE = `You estimate nutrition for a food diary from a photo and/or a short description.
List each distinct food or drink as its own item with your best estimate of the edible weight in grams as served, and its calories and macros for that weight.
Judge portions from plate, cutlery, hands and packaging for scale. Use the user's text when it gives amounts or cooking method.
Photos hide fat: give each fried, sautéed, dressed or sauced item the calories it has as normally cooked or served, fat included. Fold that fat into the item's own numbers; list oil, butter or dressing as its own item only when you can see it or the user names it.
Names are short and generic, in the user's language.`;

/**
 * How the quick pass reads a photo: the same rules worked through as steps. Measured on 60
 * Nutrition5k dishes (paired, two runs plus an interleaved confirming run of two trials each,
 * README "AI food estimate"): mean absolute error on meals of 150 kcal or more fell by about 9
 * points [-13, -5], mostly from smaller portions and from fat no longer counted twice. Used only
 * for a photo on the quick pass: on the careful pass it gained nothing and turned large meals into
 * under-counts, and typed meals keep GUIDE (already 5 to 8% median error).
 */
const GUIDE_PHOTO = `You estimate nutrition for a food diary from a photo and/or a short description.
Work through these steps before you answer:
1. Items. Name each distinct food or drink you can see or that the user names. A mixed dish you cannot take apart (a stew, a sandwich, a slice of pizza) is one item; a plate of separate foods is one item per food. Look closely before naming; when a food could be one of several things, choose the most likely and lower its confidence.
2. Portion. Estimate each item's edible weight in grams as served from what is visible: how much of the plate or bowl it covers and how thick or deep it is, against the plate, bowl, cutlery, hands or packaging. Do not default to a typical serving size: a small scoop is a small scoop. Use the user's amounts whenever they give them.
3. Energy density. Take each item's energy and macros per 100 g as cooked or served from standard reference values.
4. Fat. A fried, sautéed, dressed or sauced item carries the fat it normally has when cooked that way, inside its own numbers. List oil, butter, dressing or sauce as its own item only when you can see it apart from the food or the user names it, and then do not count it again inside the food.
5. Arithmetic. kcal = grams x energy per 100 g / 100. Protein x 4 + carbs x 4 + fat x 9 (+ alcohol x 7) comes within about a tenth of kcal; fix whichever number is wrong.
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

/** The schema-checked form's own words, after the guide. */
const JSON_FORM = `Each item: n its name, g grams, k kcal, p protein g, c carbs g, f fat g, b fiber g, q confidence, 0 to 1 for how sure you are of that item's identity and portion together.
hidden_fat_question: one short question about added fat or sauce the photo cannot show, when the answer would change the estimate by more than about 50 kcal; otherwise null.
note: at most one short sentence about what limits accuracy (for example no scale reference), or null.
If there is no food or drink, return an empty items array and say so in note.`;

/** A photo on the careful pass, and the second try when typed lines did not parse: the guidance answered as schema-checked JSON. */
const SYSTEM_JSON = `${GUIDE}\n${JSON_FORM}`;
/** A photo on the quick pass (see GUIDE_PHOTO). */
const SYSTEM_JSON_PHOTO = `${GUIDE_PHOTO}\n${JSON_FORM}`;

/** Which system text a request carries. Exported for the tests and the measuring script. */
export function systemFor(input: Pick<AnalyzeInput, 'image' | 'precise'>, format: 'lines' | 'json', again = false): string {
  if (format === 'lines') return SYSTEM_LINES;
  return input.image && !input.precise && !again ? SYSTEM_JSON_PHOTO : SYSTEM_JSON;
}

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
        // One letter each: these names are written out again for every item of every answer.
        required: ['n', 'g', 'k', 'p', 'c', 'f', 'b', 'q'],
        properties: {
          n: { type: 'string' },
          g: { type: 'integer' },
          k: { type: 'integer' },
          p: { type: 'number' },
          c: { type: 'number' },
          f: { type: 'number' },
          b: { type: 'number' },
          q: { type: 'number' },
        },
      },
    },
    hidden_fat_question: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;

/** How long one analysis may take on the server, inside the 45 s and 90 s the app waits (src/features/ai/api.ts). */
export const TIME_BUDGET_MS = { fast: 40_000, precise: 85_000 };
/** The second try's cap: a schema-checked answer with no reasoning is well under this. */
export const RETRY_MAX_TOKENS = 900;
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

/**
 * A drink whose name says it holds alcohol. Whole words only (a leading boundary too, so kale,
 * pale bread, virgin olive oil and whisked eggs are not ale, gin or whisky), and never a food
 * cooked with a drink (wine sauce, cider vinegar, beer-battered fish, margarita pizza). The bounds are
 * any letter or digit in any script, because JavaScript's \b sees neither Hebrew letters nor "é".
 */
const ALCOHOL_WORDS =
  /(?<![\p{L}\p{N}])(beers?|lagers?|ales?|ipa|stouts?|porters?|pilsners?|wines?|ros[eé]|champagne|prosecco|cava|vodka|whisk(?:e)?y|bourbon|scotch|gin|rum|tequila|mezcal|brandy|cognac|liqueurs?|cocktails?|ciders?|sake|soju|ouzo|arak|raki|sangria|mojito|margarita|martini|negroni|spritz|mead|בירה|יין|וודקה|ערק|ויסקי|קוקטייל)(?![\p{L}\p{N}])/iu;
const NOT_A_DRINK = /vinegar|sauce|gravy|braised|batter|glaze|marinade|reduction|poached|pizza|cake|bread|risotto|stew|sashimi|sushi|jus\b|alcohol[- ]free|non[- ]?alcoholic|\b0[.,]0\b|חומץ|רוטב/i;
/**
 * Soft drinks and foods named with a drink word that hold no alcohol: ginger ale, root beer, fruit
 * cocktail, cocktail tomatoes, shrimp cocktail, (hot, sparkling) apple cider. They count as a drink
 * only when the name says alcohol (hard cider, alcoholic ginger beer, 4.5% ABV).
 */
const SOFT_LOOKALIKE =
  /ginger[- ]?(?:ale|beer)s?|(?:root|birch|butter)[- ]?beers?|fruit[- ]cocktails?|cocktail[- ](?:tomato(?:es)?|sausages?|onions?|cherr(?:y|ies)|franks?|weenies?)|(?:shrimp|prawn|seafood|crab)[- ]cocktails?|(?:apple|hot|sweet|sparkling)[- ]ciders?/i;
const SAYS_ALCOHOL = /\bhard\b|(?<!non[- ]?)alcoholic|\d+(?:[.,]\d+)?\s*%\s*(?:abv|alc|vol)/i;

/**
 * Alcohol carries 7 kcal a gram that no macro holds, so for a drink the kcal above the macros is
 * kept up to what alcohol could explain: at most 0.4 g of alcohol a gram (spirits are about 0.32).
 * Only for a drink-like item: named as a drink and almost no protein or fat (under 2% of its
 * weight), so a dish with wine in its name is still checked against its macros.
 */
export function alcoholRoom(name: string, grams: number, protein: number, fat: number): number {
  if (!ALCOHOL_WORDS.test(name) || NOT_A_DRINK.test(name)) return 0;
  if (SOFT_LOOKALIKE.test(name) && !SAYS_ALCOHOL.test(name)) return 0;
  if (protein + fat >= grams * 0.02) return 0;
  return grams * 0.4 * 7;
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
    // Fibre explains small gaps and alcohol larger ones in a drink; any other large gap is an error, so fall back to the macros.
    const tolerance = Math.max(25, atwater * 0.25);
    const alcohol = kcal > atwater && kcal - atwater <= alcoholRoom(name, grams, protein, fat) + tolerance;
    if (atwater > 0 && Math.abs(kcal - atwater) > tolerance && !alcohol) kcal = atwater;
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

/** Marks a right-to-left script puts around text; they mean nothing to the form. */
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
const NUMBER_KEYS = ['grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'confidence'] as const;

/**
 * A number exactly as the form asks for it: digits, with at most one decimal mark and one or two
 * digits after it ("110", "0.9", "2,5"). Anything else is NaN: a unit, a range, a sign, a space or
 * a dot grouping thousands ("1 200", "1.200", "2,125") could each be read two ways, and a wrong
 * guess becomes a 1 g pizza in someone's diary.
 */
function column(cell: string): number {
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(cell);
  return m ? Number(`${m[1]}.${m[2] ?? '0'}`) : NaN;
}

const blank = (text: string): string | null => (/^(-+|–|—|none|null|n\/a)\.?$/i.test(text) ? null : text);

/**
 * Reads the plain-lines answer (see SYSTEM_LINES), strictly. Null unless every line keeps the
 * form: only D, I, Q and N lines, one D, Q and N at most, and every item with its name and all
 * seven plain numbers. A bulleted or numbered line, a missing or extra cell, a number written
 * with a unit: any of these means the answer is asked for again as schema-checked JSON, so
 * nothing is ever guessed from a line that is nearly right.
 */
export function parseLines(text: string): RawAnswer | null {
  const answer: RawAnswer = { dish: null, items: [], hidden_fat_question: null, note: null };
  const seen = new Set<string>();
  for (const raw of text.replace(BIDI_MARKS, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([DIQN]):?[ \t]+(.+)$/.exec(line);
    if (!m) return null;
    const rest = m[2].trim();
    if (m[1] === 'I') {
      const cells = rest.split('|').map((c) => c.trim());
      if (cells.length !== 8 || !cells[0]) return null;
      const n = cells.slice(1).map(column);
      if (n.some(Number.isNaN) || !(n[0] > 0) || n[6] > 1) return null;
      answer.items.push({ name: cells[0], grams: n[0], kcal: n[1], protein: n[2], carbs: n[3], fat: n[4], fiber: n[5], confidence: n[6] });
      continue;
    }
    if (seen.has(m[1])) return null;
    seen.add(m[1]);
    if (m[1] === 'D') answer.dish = blank(rest);
    else if (m[1] === 'Q') answer.hidden_fat_question = blank(rest);
    else answer.note = blank(rest);
  }
  if (answer.items.length === 0 && !answer.note) return null;
  return answer;
}

/** An item as the schema spells it (one letter a field) under the names the rest of the code uses. */
function spelledOut(item: unknown): unknown {
  if (!item || typeof item !== 'object' || 'name' in item) return item;
  const i = item as Record<string, unknown>;
  return { name: i.n, grams: i.g, kcal: i.k, protein: i.p, carbs: i.c, fat: i.f, fiber: i.b, confidence: i.q };
}

/**
 * Either form of answer: JSON when the text is an object, the plain lines otherwise.
 * `held` says the request carried the schema, so the object's shape is already guaranteed. JSON
 * that came back from a request for lines was held to nothing: it is used only when every item
 * has its name and numbers and the answer has an item or a note; otherwise null, like any other
 * answer that did not keep the form.
 */
export function parseAnswer(text: string, held = false): RawAnswer | null {
  if (!text.trimStart().startsWith('{')) return held ? null : parseLines(text);
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    const items = Array.isArray(o.items) ? o.items : null;
    if (!held) {
      const whole = (v: unknown) => {
        if (!v || typeof v !== 'object') return false;
        const i = v as Record<string, unknown>;
        return typeof i.name === 'string' && NUMBER_KEYS.every((k) => typeof i[k] === 'number' && Number.isFinite(i[k]));
      };
      if (!items || !items.every(whole) || (items.length === 0 && !str(o.note))) return null;
    }
    return { dish: str(o.dish), items: (items ?? []).map(spelledOut), hidden_fat_question: str(o.hidden_fat_question), note: str(o.note) };
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
  /**
   * The answer's form. By default a typed description is answered in plain lines (about a tenth
   * cheaper, the same accuracy) and a photo as schema-checked JSON: on photos the lines cost the
   * same once their second tries are counted, and judged a large dish smaller (measured).
   */
  format?: 'lines' | 'json';
  /**
   * 'off' switches the small model's thinking off: about 40% cheaper on typed meals, and measurably
   * less accurate (54 of 60 typed meals inside their range instead of 60). The careful pass always thinks.
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
  const started = Date.now();
  // The app gives up after 45 s (90 s for the careful pass): answer, or fail, before it does.
  const budgetMs = input.precise ? TIME_BUDGET_MS.precise : TIME_BUDGET_MS.fast;
  let servedBy = model;
  /**
   * One request in one answer form. Returns the answer's text; what it used is added to `usage`.
   * `again` marks the second try: it is the schema-checked form, which needs no thinking and no
   * long answer, so it is capped tightly and cannot be turned into a second full-price request.
   */
  const ask = async (format: 'lines' | 'json', again = false): Promise<string> => {
    const base = {
      model,
      // Reasoning counts toward this cap, so it leaves room for both; a typical answer uses 60 to 400 tokens.
      max_tokens: again ? RETRY_MAX_TOKENS : 2000,
      ...(!input.precise && (again || options.thinking === 'off') ? { thinking: { type: 'disabled' as const } } : null),
      system: systemFor(input, format, again),
      messages: [{ role: 'user' as const, content }],
      output_config:
        format === 'lines'
          ? { effort }
          : { effort, format: { type: 'json_schema' as const, schema: SCHEMA as unknown as Record<string, unknown> } },
    };
    // The first request may be retried once by the SDK; the second try gets what time is left and no retries.
    // Whole milliseconds: the SDK refuses a fractional timeout, and 85,000 x 0.7 is not a whole number in floating point.
    const limits = again ? { timeout: Math.max(5_000, Math.round(started + budgetMs - Date.now())), maxRetries: 0 } : { timeout: Math.round(budgetMs * 0.7), maxRetries: 1 };
    let response: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      response = input.precise
        ? // The stronger model can decline a request through its safety classifiers;
          // the server-side fallback re-runs it on another model inside the same call.
          await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, limits)
        : await client.messages.create(base, limits);
    } catch (error) {
      // What an earlier request of this analysis used is still billed: every failure after it carries that.
      const spent = usage.inputTokens + usage.outputTokens > 0 ? { ...usage } : undefined;
      if (error instanceof Anthropic.RateLimitError) {
        throw new AnalyzeError('rate_limited', 'The analysis service is busy. Try again in a moment.', 429, spent);
      }
      if (error instanceof Anthropic.BadRequestError && !spent) {
        throw new AnalyzeError('bad_request', 'That image could not be read. Try another photo.', 400);
      }
      if (error instanceof Anthropic.APIError || spent) {
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

  const first = options.format ?? (input.image ? 'json' : 'lines');
  let parsed = first === 'json' ? parseAnswer(await ask('json'), true) : parseAnswer(await ask('lines'));
  // The lines did not keep their form (about one answer in twenty-five): ask once more, this time
  // held to the schema, unless the first try already used most of the time the app will wait.
  if (!parsed && first !== 'json' && Date.now() - started < budgetMs / 2) parsed = parseAnswer(await ask('json', true), true);
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
