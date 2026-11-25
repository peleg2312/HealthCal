/**
 * The quote of the day on the morning page: bundled, never fetched, the same all day and on every
 * device.
 *
 * Every quote is a real quote by a named person who died before 1955 (a translation is a named one
 * published before 1930), found word for word on the author's own English Wikiquote page
 * (https://en.wikiquote.org/wiki/<page>) under a sourced work, never under Disputed,
 * Misattributed, Attributed or "Quotes about". The comment above each one names the page and the
 * heading it stands under (checked against the raw wikitext on 17 and 18 November 2026; the six
 * that replaced quotes holding the page's banned words on 25 November 2026). Wording,
 * spelling and inner quotation marks are as printed there, with typographic quotes stored as
 * straight ASCII; a verse line break is "\n". A quote is cut only at a sentence end, never with an
 * ellipsis.
 *
 * Every quote must give heart when read alone at 7 in the morning with no knowledge of its book:
 * for effort, for keeping on, for beginning again after a hard day, or for rest as part of doing
 * well. Nothing about religion, politics, war, death, dieting or the body, nothing that scolds,
 * and nothing that uses "he" or "men" for everyone. Plain present-day English, for a tired reader
 * and for one whose first language is not English: no thou, thee, thy, thine, hath, doth, wilt or
 * shalt, no -eth verbs, no 18th-century spellings such as produc'd, and nothing addressed to a
 * named person ('Tis in the Tennyson line may stay). A rest quote is about rest, sleep or
 * recovery as part of doing well.
 *
 * How a day's quote is chosen: the days run in a fixed cycle of 31 (`QUOTE_DAYS`, counted from
 * `QUOTE_EPOCH`), and every quote belongs to exactly one of them. Each day has an 'again' quote
 * (beginning again: a day over the band, part-logged or with no food), an 'onward' quote (keeping
 * on: a steady day) and sometimes a 'rest' quote (after a night under 6 hours; a day without one
 * falls back to its 'again' quote). So the pick depends only on the date and how yesterday went,
 * and a quote can come back only after 31 days, whatever the theme.
 *
 * Adding a quote: only with its Wikiquote check, into a day's empty `rest` slot (or by replacing
 * one); keep the table at 31 days, since its length is the cycle (a longer table would move every
 * later day's pick). quotes.test.ts holds the rules.
 */
import { diffDays } from '@/lib/dates';
import type { ISODate } from '@/types';

export type QuoteTheme = 'again' | 'onward' | 'rest';

export interface Quote {
  /** Stable id, `<author>-<word>`; kept on the device by the page's pin and used by `?quote=`. */
  id: string;
  /** The words exactly as printed on Wikiquote; "\n" between verse lines. */
  text: string;
  author: string;
  /** The sourced work and its year, as shown under the author. */
  work: string;
  theme: QuoteTheme;
}

export interface QuoteDay {
  again: Quote;
  onward: Quote;
  rest?: Quote;
}

/** Day 0 of the cycle. */
export const QUOTE_EPOCH: ISODate = '2026-01-01';

/** Under this many hours of sleep last night the quote comes from the rest pool (spec section 4.7). */
export const REST_UNDER_HOURS = 6;

/**
 * Year of death of every author (from the first line of the author's Wikiquote page). Seneca's
 * letters are in Richard M. Gummere's Loeb translation, named in the page's section note: Letters
 * I and XXXI are in volume I (1917), Letters XCV and CXVI in volume III (1925). His On Tranquility
 * of the Mind is in William Bell Langsdorf's translation, Tranquillity of Mind and Providence
 * (1900), also named in the page's section note. Tagore wrote Stray Birds in English himself.
 * Owen Meredith is the pen name under which Robert Bulwer-Lytton published Lucile; his Wikiquote
 * page is Robert_Bulwer-Lytton,_1st_Earl_of_Lytton.
 */
export const AUTHOR_DIED: Record<string, number> = {
  'Henry David Thoreau': 1862,
  'Ralph Waldo Emerson': 1882,
  'Emily Dickinson': 1886,
  'Benjamin Franklin': 1790,
  'John Muir': 1914,
  'Louisa May Alcott': 1888,
  'Robert Louis Stevenson': 1894,
  'William James': 1910,
  'John Keats': 1821,
  'Rabindranath Tagore': 1941,
  'Henry Wadsworth Longfellow': 1882,
  Seneca: 65,
  'Rudyard Kipling': 1936,
  'Alfred, Lord Tennyson': 1892,
  'Thomas Carlyle': 1881,
  'Percy Bysshe Shelley': 1822,
  'Samuel Johnson': 1784,
  'George Eliot': 1880,
  'Robert Browning': 1889,
  'Henry Ward Beecher': 1887,
  'Booker T. Washington': 1915,
  'James Russell Lowell': 1891,
  'Elbert Hubbard': 1915,
  'Ella Wheeler Wilcox': 1919,
  'Henry van Dyke': 1933,
  'Charlotte Brontë': 1855,
  'Charles Dickens': 1870,
  'Sydney Smith': 1845,
  'Samuel Smiles': 1904,
  'John Ruskin': 1900,
  'William Hazlitt': 1830,
  'Frances Hodgson Burnett': 1924,
  'William Henry Davies': 1940,
  'Owen Meredith': 1891,
  'Virginia Woolf': 1941,
  'L. M. Montgomery': 1942,
};

/** The 31-day cycle. Each comment: the Wikiquote page, the heading path, and the source line under the quote. */
export const QUOTE_DAYS: QuoteDay[] = [
  // 0
  {
    again:
      // Henry_David_Thoreau: Quotes > Walden (1854) (p. 375)
      { id: 'thoreau-dawns', theme: 'again', author: "Henry David Thoreau", work: "Walden, 1854",
        text: "Only that day dawns to which we are awake. There is more day to dawn. The sun is but a morning star." },
    onward:
      // Ralph_Waldo_Emerson: Quotes > Society and Solitude (1870) (Works and Days)
      { id: 'emerson-best-day', theme: 'onward', author: "Ralph Waldo Emerson", work: "Society and Solitude, 1870",
        text: "Write it on your heart that every day is the best day in the year." },
  },
  // 1
  {
    again:
      // Emily_Dickinson: Quotes (Letter to Louise Norcross (late 1872); Letters (1958) p. 499, no. 379)
      { id: 'dickinson-newer', theme: 'again', author: "Emily Dickinson", work: "Letter to Louise Norcross, 1872",
        text: "We turn not older with years, but newer every day." },
    onward:
      // Benjamin_Franklin: Quotes > Poor Richard's Almanack (1733-1758) (Poor Richard's Almanack (1737))
      { id: 'franklin-well-done', theme: 'onward', author: "Benjamin Franklin", work: "Poor Richard's Almanack, 1737",
        text: "Well done is better than well said." },
    rest:
      // John_Muir: Quotes > John of the Mountains, 1938 (page 235)
      { id: 'muir-woods', theme: 'rest', author: "John Muir", work: "John of the Mountains, 1938",
        text: "Come to the woods, for here is rest." },
  },
  // 2
  {
    again:
      // Louisa_May_Alcott: Quotes > Little Women (1868) (Amy, in Ch. 44 : My Lord and Lady; part of this has sometimes been slightly misquoted as: )
      { id: 'alcott-storms', theme: 'again', author: "Louisa May Alcott", work: "Little Women, 1868",
        text: "I'm not afraid of storms, for I'm learning how to sail my ship." },
    onward:
      // Robert_Louis_Stevenson: Quotes > Virginibus Puerisque and Other Papers (1881) (El Dorado.)
      { id: 'stevenson-travel', theme: 'onward', author: "Robert Louis Stevenson", work: "Virginibus Puerisque, 1881",
        text: "To travel hopefully is a better thing than to arrive." },
  },
  // 3
  {
    again:
      // Ralph_Waldo_Emerson: Quotes > Journals (1822–1863) (November 11, 1842)
      { id: 'emerson-experiment', theme: 'again', author: "Ralph Waldo Emerson", work: "Journals, 1842",
        text: "Do not be too timid and squeamish about your actions. All life is an experiment. The more experiments you make the better." },
    onward:
      // William_James: Quotes > 1900s (Correspondence with Helen Keller, 1908, in The Correspondence of William James: April 1908)
      { id: 'james-difference', theme: 'onward', author: "William James", work: "Letter to Helen Keller, 1908",
        text: "Act as if what you do makes a difference. It does." },
    rest:
      // John_Keats: Quotes > Endymion (1818) (Bk. I, l. 705)
      { id: 'keats-patience', theme: 'rest', author: "John Keats", work: "Endymion, 1818",
        text: "Time, that aged nurse,\nRocked me to patience." },
  },
  // 4
  {
    again:
      // Rabindranath_Tagore: Quotes > Stray Birds (1916) (235)
      { id: 'tagore-morning', theme: 'again', author: "Rabindranath Tagore", work: "Stray Birds, 1916",
        text: "Do not say, \"It is morning,\" and dismiss it with a name of yesterday. See it for the first time as a new-born child that has no name." },
    onward:
      // Henry_Wadsworth_Longfellow: Quotes > Voices of the Night (1839) > A Psalm of Life (St. 3.)
      { id: 'longfellow-further', theme: 'onward', author: "Henry Wadsworth Longfellow", work: "A Psalm of Life, 1838",
        text: "Not enjoyment, and not sorrow,\nIs our destined end or way;\nBut to act, that each to-morrow\nFinds us further than to-day." },
  },
  // 5
  {
    again:
      // Robert_Louis_Stevenson: Quotes > Virginibus Puerisque and Other Papers (1881) (An Apology for Idlers)
      { id: 'stevenson-happy', theme: 'again', author: "Robert Louis Stevenson", work: "Virginibus Puerisque, 1881",
        text: "There is no duty we so much underrate as the duty of being happy." },
    onward:
      // Rudyard_Kipling: Quotes > Other works (A Doctor's Work, an address at Middlesex Hospital (October 1908).)
      { id: 'kipling-enough', theme: 'onward', author: "Rudyard Kipling", work: "A Doctor's Work, 1908",
        text: "Enough work to do, and strength enough to do the work." },
  },
  // 6
  {
    again:
      // Alfred,_Lord_Tennyson: Quotes > Ulysses (1842) (l. 54-62)
      { id: 'tennyson-newer-world', theme: 'again', author: "Alfred, Lord Tennyson", work: "Ulysses, 1842",
        text: "Come, my friends.\n'Tis not too late to seek a newer world." },
    onward:
      // Thomas_Carlyle: Quotes > Past and Present (1843) (From Past and Present (1843), Chapter XI : Labour)
      { id: 'carlyle-noble-work', theme: 'onward', author: "Thomas Carlyle", work: "Past and Present, 1843",
        text: "Every noble work is at first impossible." },
    rest:
      // Robert_Bulwer-Lytton,_1st_Earl_of_Lytton: Quotes > Lucile (1860) (Part i, canto vi, section xxvi.)
      { id: 'meredith-strife', theme: 'rest', author: "Owen Meredith", work: "Lucile, 1860",
        text: "Rest is sweet after strife." },
  },
  // 7
  {
    again:
      // Percy_Bysshe_Shelley: Quotes > Ode to the West Wind (1819) (St. V)
      { id: 'shelley-spring', theme: 'again', author: "Percy Bysshe Shelley", work: "Ode to the West Wind, 1819",
        text: "If Winter comes, can Spring be far behind?" },
    onward:
      // Samuel_Johnson: The History of Rasselas, Prince of Abissinia (1759) > Ch. XII
      { id: 'johnson-diligence', theme: 'onward', author: "Samuel Johnson", work: "The History of Rasselas, 1759",
        text: "Few things are impossible to diligence and skill." },
  },
  // 8
  {
    again:
      // George_Eliot: Quotes > Daniel Deronda (1876)
      { id: 'eliot-growth', theme: 'again', author: "George Eliot", work: "Daniel Deronda, 1876",
        text: "I say that the strongest principle of growth lies in human choice." },
    onward:
      // Alfred,_Lord_Tennyson: Quotes > Ulysses (1842) (l. 63-70)
      { id: 'tennyson-strive', theme: 'onward', author: "Alfred, Lord Tennyson", work: "Ulysses, 1842",
        text: "To strive, to seek, to find, and not to yield." },
    rest:
      // Virginia_Woolf: Quotes > A Room of One's Own (1929) (Ch. 1, p. 17)
      { id: 'woolf-hurry', theme: 'rest', author: "Virginia Woolf", work: "A Room of One's Own, 1929",
        text: "No need to hurry. No need to sparkle. No need to be anybody but oneself." },
  },
  // 9
  {
    again:
      // Robert_Browning: Quotes > Paracelsus (1835) (Part 4.)
      { id: 'browning-gain', theme: 'again', author: "Robert Browning", work: "Paracelsus, 1835",
        text: "Every joy is gain\nAnd gain is gain, however small." },
    onward:
      // Thomas_Carlyle: Quotes > Signs of the Times (1829)
      { id: 'carlyle-at-hand', theme: 'onward', author: "Thomas Carlyle", work: "Signs of the Times, 1829",
        text: "Our grand business undoubtedly is, not to see what lies dimly at a distance, but to do what lies clearly at hand." },
  },
  // 10
  {
    again:
      // Samuel_Johnson: The History of Rasselas, Prince of Abissinia (1759) > Ch. XLVII
      { id: 'johnson-tomorrow', theme: 'again', author: "Samuel Johnson", work: "The History of Rasselas, 1759",
        text: "The world is not yet exhausted: let me see something to-morrow which I never saw before." },
    onward:
      // William_James: Quotes > 1890s > The Principles of Psychology (1890) (Ch. 4)
      { id: 'james-effort', theme: 'onward', author: "William James", work: "The Principles of Psychology, 1890",
        text: "Keep the faculty of effort alive in you by a little gratuitous exercise every day." },
  },
  // 11
  {
    again:
      // Henry_van_Dyke: Quotes (Reliance, st. 2.)
      { id: 'vandyke-faltering', theme: 'again', author: "Henry van Dyke", work: "Reliance, 1904",
        text: "But often faltering feet\nCome surest to the goal;\nAnd they who walk in darkness meet\nThe sunrise of the soul." },
    onward:
      // William_Hazlitt: Quotes > The Spirit of the Age (1825) ("Mr. Brougham — Sir F. Burdett")
      { id: 'hazlitt-more-we-do', theme: 'onward', author: "William Hazlitt", work: "The Spirit of the Age, 1825",
        text: "The more we do, the more we can do; the more busy we are, the more leisure we have." },
    rest:
      // Seneca_the_Younger: Quotes > On Tranquility of the Mind
      { id: 'seneca-relaxation', theme: 'rest', author: "Seneca", work: "On Tranquility of the Mind, translated by William Bell Langsdorf, 1900",
        text: "Our minds must have relaxation: rested, they will rise up better and keener." },
  },
  // 12
  {
    again:
      // Rabindranath_Tagore: Quotes > Stray Birds (1916) (213)
      { id: 'tagore-dawn', theme: 'again', author: "Rabindranath Tagore", work: "Stray Birds, 1916",
        text: "Night's darkness is a bag that bursts with the gold of the dawn." },
    onward:
      // Seneca_the_Younger: Quotes > Epistulae Morales ad Lucilium (Moral Letters to Lucilius) > Letter XCV: On the usefulness of basic principles
      { id: 'seneca-acts', theme: 'onward', author: "Seneca", work: "Moral Letters to Lucilius, translated by Richard M. Gummere, 1925",
        text: "As our acts and our thoughts are, so will our lives be." },
  },
  // 13
  {
    again:
      // Robert_Louis_Stevenson: Quotes > Treasure Island (1883) (Ch. 12, Council of War.)
      { id: 'stevenson-go-on', theme: 'again', author: "Robert Louis Stevenson", work: "Treasure Island, 1883",
        text: "We must go on, because we can't turn back." },
    onward:
      // Henry_Ward_Beecher: Quotes > Life Thoughts (1858) (p. 95)
      { id: 'beecher-rudder', theme: 'onward', author: "Henry Ward Beecher", work: "Life Thoughts, 1858",
        text: "The first hour of the morning is the rudder of the day." },
    rest:
      // John_Muir: Quotes > John of the Mountains, 1938 (August 1875, page 220)
      { id: 'muir-tranquil', theme: 'rest', author: "John Muir", work: "John of the Mountains, 1938",
        text: "Nature in her green, tranquil woods heals and soothes all afflictions." },
  },
  // 14
  {
    again:
      // George_Eliot: Quotes > Middlemarch (1871-72)
      { id: 'eliot-limit', theme: 'again', author: "George Eliot", work: "Middlemarch, 1872",
        text: "Every limit is a beginning as well as an ending." },
    onward:
      // Booker_T._Washington: Quotes > 1900s > Up From Slavery (1901) (Chapter XII: Raising Money)
      { id: 'washington-hard-work', theme: 'onward', author: "Booker T. Washington", work: "Up From Slavery, 1901",
        text: "Nothing ever comes to me, that is worth having, except as the result of hard work." },
  },
  // 15
  {
    again:
      // Lucy_Maud_Montgomery: Quotes > Rainbow Valley (1919) (Ch. 13; the second of the entry's two sentences)
      { id: 'montgomery-chapter', theme: 'again', author: "L. M. Montgomery", work: "Rainbow Valley, 1919",
        text: "When we imagine we have finished our story fate has a trick of turning the page and showing us yet another chapter." },
    onward:
      // Thomas_Carlyle: Quotes > Boswell's Life of Johnson (1832)
      { id: 'carlyle-seed', theme: 'onward', author: "Thomas Carlyle", work: "Boswell's Life of Johnson, 1832",
        text: "All work is as seed sown; it grows and spreads, and sows itself anew." },
  },
  // 16
  {
    again:
      // Ralph_Waldo_Emerson: Quotes > Letters and Social Aims (1876) (Progress of Culture Phi Beta Kappa Address (July 18, 1867))
      { id: 'emerson-hope', theme: 'again', author: "Ralph Waldo Emerson", work: "Letters and Social Aims, 1876",
        text: "No hope so bright but is the beginning of its own fulfillment." },
    onward:
      // Henry_David_Thoreau: Quotes > Journals (1838-1859) (April 20, 1840)
      { id: 'thoreau-morning-walk', theme: 'onward', author: "Henry David Thoreau", work: "Journal, 1840",
        text: "An early morning walk is a blessing for the whole day." },
    rest:
      // Robert_Louis_Stevenson: Quotes ('La Fère of Cursed Memory', 15th vignette of An Inland Voyage (1878), in Collected Memoirs)
      { id: 'stevenson-quiet-minds', theme: 'rest', author: "Robert Louis Stevenson", work: "An Inland Voyage, 1878",
        text: "Quiet minds cannot be perplexed or frightened but go on in fortune or misfortune at their own private pace, like a clock during a thunderstorm." },
  },
  // 17
  {
    again:
      // Ella_Wheeler_Wilcox: Poetry quotes > New Thought Pastels (1913) (Climbing)
      { id: 'wilcox-climbs', theme: 'again', author: "Ella Wheeler Wilcox", work: "New Thought Pastels, 1913",
        text: "Who climbs the mountain does not always climb.\nThe winding road slants downward many a time;\nYet each descent is higher than the last." },
    onward:
      // Henry_van_Dyke: Quotes > Little Rivers (1895) (Ampersand)
      { id: 'vandyke-mountain', theme: 'onward', author: "Henry van Dyke", work: "Little Rivers, 1895",
        text: "Every mountain is, rightly considered, an invitation to climb." },
  },
  // 18
  {
    again:
      // Samuel_Johnson: The Rambler (1750–1752) (No. 67 (6 November 1750))
      { id: 'johnson-hope', theme: 'again', author: "Samuel Johnson", work: "The Rambler, 1750",
        text: "Hope is necessary in every condition." },
    onward:
      // James_Russell_Lowell: Quotes > Poems: Second Series (1848) ("Columbus" (1844), p. 16)
      { id: 'lowell-one-day', theme: 'onward', author: "James Russell Lowell", work: "Columbus, 1844",
        text: "One day with life and heart\nIs more than time enough to find a world." },
    rest:
      // William_Henry_Davies: Quotes > "Leisure"
      { id: 'davies-leisure', theme: 'rest', author: "William Henry Davies", work: "Leisure, 1911",
        text: "What is this life if, full of care,\nWe have no time to stand and stare." },
  },
  // 19
  {
    again:
      // Rabindranath_Tagore: Quotes > Stray Birds (1916) (6)
      { id: 'tagore-stars', theme: 'again', author: "Rabindranath Tagore", work: "Stray Birds, 1916",
        text: "If you shed tears when you miss the sun, you also miss the stars." },
    onward:
      // John_Muir: Quotes > 1900s > Our National Parks (1901) ("The Yellowstone National Park", The Atlantic Monthly, volume LXXXI, number 486 (April 189)
      { id: 'muir-climb', theme: 'onward', author: "John Muir", work: "Our National Parks, 1901",
        text: "Climb the mountains and get their good tidings." },
  },
  // 20
  {
    again:
      // Charlotte_Brontë: Quotes (15 January, 1849. As quoted in Elizabeth Gaskell The life of Charlotte Brontë (1870), p. 2)
      { id: 'bronte-upward', theme: 'again', author: "Charlotte Brontë", work: "Letter, 15 January 1849",
        text: "I avoid looking forward or backward, and try to keep looking upward." },
    onward:
      // Elbert_Hubbard: Quotes > The Note Book of Elbert Hubbard (1927) (p. 242)
      { id: 'hubbard-today', theme: 'onward', author: "Elbert Hubbard", work: "The Note Book of Elbert Hubbard, 1927",
        text: "The best preparation for good work tomorrow is to do good work today." },
  },
  // 21
  {
    again:
      // Charles_Dickens: Quotes > Great Expectations (1860-1861) (Ch. 59)
      { id: 'dickens-bent', theme: 'again', author: "Charles Dickens", work: "Great Expectations, 1861",
        text: "I have been bent and broken, but — I hope — into a better shape." },
    onward:
      // Henry_Wadsworth_Longfellow: Quotes > Voices of the Night (1839) > A Psalm of Life (St. 9.)
      { id: 'longfellow-up-and-doing', theme: 'onward', author: "Henry Wadsworth Longfellow", work: "A Psalm of Life, 1838",
        text: "Let us, then, be up and doing.\nWith a heart for any fate;\nStill achieving, still pursuing,\nLearn to labor and to wait." },
    rest:
      // Ralph_Waldo_Emerson: Quotes > Journals (1822–1863) (May 25, 1843)
      { id: 'emerson-sky', theme: 'rest', author: "Ralph Waldo Emerson", work: "Journals, 1843",
        text: "The sky is the daily bread of the eyes." },
  },
  // 22
  {
    again:
      // Rabindranath_Tagore: Quotes > Stray Birds (1916) (130)
      { id: 'tagore-errors', theme: 'again', author: "Rabindranath Tagore", work: "Stray Birds, 1916",
        text: "If you shut your door to all errors truth will be shut out." },
    onward:
      // Sydney_Smith: Quotes > Lady Holland's Memoir (1855) (Vol. I, ch. 12, p. 472)
      { id: 'sydney-today', theme: 'onward', author: "Sydney Smith", work: "A Memoir of the Reverend Sydney Smith, 1855",
        text: "We know nothing of tomorrow; our business is to be good and happy today." },
  },
  // 23
  {
    again:
      // Seneca_the_Younger: Quotes > Epistulae Morales ad Lucilium (Moral Letters to Lucilius) > Letter CXVI: On Real Ethics as Superior to Syllogistic Subtleties
      { id: 'seneca-braver', theme: 'again', author: "Seneca", work: "Moral Letters to Lucilius, translated by Richard M. Gummere, 1925",
        text: "Make me braver, make me calmer, make me the equal of Fortune, make me her superior." },
    onward:
      // Samuel_Smiles: Quotes (Duty: With Illustrations of Courage, Patience, and Endurance (1880), Ch. 2, p. 49)
      { id: 'smiles-good-actions', theme: 'onward', author: "Samuel Smiles", work: "Duty, 1880",
        text: "Good actions give strength to ourselves, and inspire good actions in others." },
  },
  // 24
  {
    again:
      // William_Hazlitt: Quotes ("On The Conduct of Life" (1822))
      { id: 'hazlitt-road', theme: 'again', author: "William Hazlitt", work: "On the Conduct of Life, 1822",
        text: "You know more of a road by having travelled it than by all the conjectures and descriptions in the world." },
    onward:
      // Ralph_Waldo_Emerson: Quotes > English Traits (1856) (First Visit to England)
      { id: 'emerson-thing', theme: 'onward', author: "Ralph Waldo Emerson", work: "English Traits, 1856",
        text: "The thing done avails, and not what is said about it. An original sentence, a step forward, is worth more than all the censures." },
  },
  // 25
  {
    again:
      // John_Ruskin: Quotes > The Two Paths (1859) (Lecture IV: The Influence of Imagination in Architecture, section 137)
      { id: 'ruskin-endurance', theme: 'again', author: "John Ruskin", work: "The Two Paths, 1859",
        text: "Endurance is nobler than strength, and patience than beauty." },
    onward:
      // Seneca_the_Younger: Quotes > Epistulae Morales ad Lucilium (Moral Letters to Lucilius) > Letter I: On Saving Time
      { id: 'seneca-today', theme: 'onward', author: "Seneca", work: "Moral Letters to Lucilius, translated by Richard M. Gummere, 1917",
        text: "Lay hold of today's task, and you will not need to depend so much upon tomorrow's. While we are postponing, life speeds by." },
  },
  // 26
  {
    again:
      // Ralph_Waldo_Emerson: Quotes > Letters and Social Aims (1876) (Progress of Culture)
      { id: 'emerson-amateur', theme: 'again', author: "Ralph Waldo Emerson", work: "Letters and Social Aims, 1876",
        text: "Every artist was first an amateur." },
    onward:
      // Booker_T._Washington: Quotes (The Story of My Life and Work, vol. I (1900), ch. XV: Cuban Education and the Chicago Peac)
      { id: 'washington-lift', theme: 'onward', author: "Booker T. Washington", work: "The Story of My Life and Work, 1900",
        text: "I think I have learned that the best way to lift one's self up is to help someone else." },
    rest:
      // Henry_David_Thoreau: Quotes > Walden (1854) (p. 105)
      { id: 'thoreau-simplify', theme: 'rest', author: "Henry David Thoreau", work: "Walden, 1854",
        text: "Simplify, simplify." },
  },
  // 27
  {
    again:
      // George_Eliot: Quotes > The Poems of George Eliot (1884) ("The Legend of Jubal")
      { id: 'eliot-heroes', theme: 'again', author: "George Eliot", work: "The Poems of George Eliot, 1884",
        text: "Such patience have the heroes who begin,\nSailing the first toward lands which others win." },
    onward:
      // Thomas_Carlyle: Quotes > Critical and Miscellaneous Essays (1827–1855) (On History.)
      { id: 'carlyle-acorns', theme: 'onward', author: "Thomas Carlyle", work: "On History, 1830",
        text: "When the oak-tree is felled, the whole forest echoes with it; but a hundred acorns are planted silently by some unnoticed breeze." },
  },
  // 28
  {
    again:
      // William_Hazlitt: Quotes > Characteristics, in the manner of Rochefoucauld's Maxims (1823) (No. 89)
      { id: 'hazlitt-confidence', theme: 'again', author: "William Hazlitt", work: "Characteristics, 1823",
        text: "As is our confidence, so is our capacity." },
    onward:
      // Ralph_Waldo_Emerson: Quotes > The American Scholar (1837) (par. 35)
      { id: 'emerson-right-step', theme: 'onward', author: "Ralph Waldo Emerson", work: "The American Scholar, 1837",
        text: "Success treads on every right step." },
  },
  // 29
  {
    again:
      // Frances_Hodgson_Burnett: Quotes > The Secret Garden (1911) (Chapter 22)
      { id: 'burnett-magic', theme: 'again', author: "Frances Hodgson Burnett", work: "The Secret Garden, 1911",
        text: "Being alive is the Magic—being strong is the Magic." },
    onward:
      // Seneca_the_Younger: Quotes > Epistulae Morales ad Lucilium (Moral Letters to Lucilius) > Letter XXXI: On Siren Songs
      { id: 'seneca-work', theme: 'onward', author: "Seneca", work: "Moral Letters to Lucilius, translated by Richard M. Gummere, 1917",
        text: "It is not enough if you do not shrink from work; ask for it." },
  },
  // 30
  {
    again:
      // Charlotte_Brontë: Quotes > Villette (1853) (Ch. VI: London)
      { id: 'bronte-liberty', theme: 'again', author: "Charlotte Brontë", work: "Villette, 1853",
        text: "Liberty lends us her wings and Hope guides us by her star." },
    onward:
      // Ella_Wheeler_Wilcox: Poetry quotes > New Thought Pastels (1913) ("Will," included in Maurine: And Other Poems, p. 145 (1882). Often quoted by Nigerian drum)
      { id: 'wilcox-resolve', theme: 'onward', author: "Ella Wheeler Wilcox", work: "Will, 1882",
        text: "There is no chance, no destiny, no fate,\nCan circumvent or hinder or control\nThe firm resolve of a determined soul." },
  },
];

/** Every quote once, day by day (again, onward, rest). */
export const QUOTES: Quote[] = QUOTE_DAYS.flatMap((d) => (d.rest ? [d.again, d.onward, d.rest] : [d.again, d.onward]));

/** The day's place in the 31-day cycle (also right for dates before the epoch). */
export function quoteDayIndex(today: ISODate): number {
  const n = QUOTE_DAYS.length;
  return ((diffDays(QUOTE_EPOCH, today) % n) + n) % n;
}

/** How yesterday went, as the quote sees it (fields of DayFacts). */
export interface QuoteDayFacts {
  foodLogged: boolean;
  complete: boolean;
  overBand: boolean;
}

/**
 * Which pool today's quote comes from: 'rest' after a logged night under 6 hours; else 'again'
 * when yesterday had no food, was part-logged or went over the 10% band; else 'onward'.
 */
export function quoteTheme(y: QuoteDayFacts, lastNightHours: number | null): QuoteTheme {
  if (lastNightHours != null && Number.isFinite(lastNightHours) && lastNightHours < REST_UNDER_HOURS) return 'rest';
  if (!y.foodLogged || !y.complete || y.overBand) return 'again';
  return 'onward';
}

/** The quote for a day and theme; a day with no rest quote gives its 'again' quote. */
export function quoteFor(today: ISODate, theme: QuoteTheme): Quote {
  const day = QUOTE_DAYS[quoteDayIndex(today)];
  return day[theme] ?? day.again;
}

/** The quote with this id, only when it belongs to `today`'s place in the cycle (so a pin can never break the 30-day rule). */
export function quoteOnDay(today: ISODate, id: string): Quote | undefined {
  const day = QUOTE_DAYS[quoteDayIndex(today)];
  return [day.again, day.onward, day.rest].find((q) => q?.id === id);
}

/** Any quote by id, for the test-hook `?quote=<id>` only. */
export function quoteById(id: string): Quote | undefined {
  return QUOTES.find((q) => q.id === id);
}

/** What a screen reader hears for the quote block. */
export function quoteAccessibilityLabel(q: Quote): string {
  const words = q.text.replace(/\n/g, ' ');
  // A period only where the words do not already end a sentence ("...a morning star." is read once).
  const end = /[.?!"']$/.test(words) ? '' : '.';
  return `Quote of the day. ${words}${end} ${q.author}, ${q.work}`;
}
