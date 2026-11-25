/**
 * The terms and the privacy text (`/legal/terms`, `/legal/privacy`) as data: one document each, made of
 * a short layer (`summary`, a few lines that restate the sections under them) and sections with a
 * heading and short paragraphs. The screens only place them (./LegalScreen.tsx).
 *
 * WRITTEN FROM WHAT THE APP DOES. Every fact here is one the code keeps: what is sent to the AI is the
 * coach's `COACH_FACTS` and the food estimate's consent sheet; health data is docs/health-sync.md; the
 * plan table is supabase/migrations/20261123000000_billing.sql; reports are 20261123000100_ai_reports.sql.
 * When one of those changes, change the words here and `LEGAL_UPDATED` together.
 *
 * WHAT IS LEFT FOR THE OWNER. No company name, postal address, governing law or support address is
 * written here: the owner adds them (docs/plans-and-payments.md lists what is missing and what a lawyer
 * should read). `CONTACT_EMAIL` stays empty until the owner gives a support address; a page shows its
 * contact line only when it is set. No sentence names a payment company.
 *
 * The words pass the app's banned list and sentence case (content.test.ts).
 */

/**
 * The day these texts last changed (YYYY-MM-DD). 2026-11-24: each page gained its short layer (`summary`),
 * and on the privacy page it stands where the "In short" section was drawn. 2026-11-25: the privacy page's
 * short layer gained its friends line (what a friend sees, from the Friends section), its export line says
 * the coach chat stays on the phone (as the coach section does), and the profile is said to hold the goal
 * weight and the calorie target. Later on 2026-11-25: meal photos (src/features/journal) are said to stay on the phone,
 * never uploaded, synced or exported (the device and export sections, the AI estimate section and the short
 * layer's export line). A section's `jump` label is navigation, not text of the page: adding or
 * changing one does not move the date.
 */
export const LEGAL_UPDATED = '2026-11-25';

/** The support address the pages give. Empty until the owner supplies one: never a personal address. */
export const CONTACT_EMAIL = '';

/** The paid plan's name in these texts, short and in full. */
const PLUS = 'Plus';
const PLUS_FULL = 'HealthCal Plus';

export interface LegalSection {
  /** Stable id, for the test and the screen's testIDs (`legal-<doc>-<id>`). */
  id: string;
  heading: string;
  /**
   * A short label of one to three words for the "On this page" list, where the heading is long. For
   * navigation only: never drawn as the section's heading, and made of words of its own heading, so it
   * cannot say something the heading does not (content.test.ts). Without one the heading is the label.
   */
  jump?: string;
  paragraphs: readonly string[];
}

/** The label a section wears in the "On this page" list. */
export const jumpLabel = (section: LegalSection): string => section.jump ?? section.heading;

/** One line of the short layer at the top of a page. The screen gives each id its mark; the words hold none. */
export interface LegalSummaryItem {
  id: string;
  text: string;
}

export interface LegalDocument {
  id: 'terms' | 'privacy';
  /** The header's title and the short line under it. */
  title: string;
  subtitle: string;
  /**
   * The short layer ("In short"): a few plain lines first, the full text under them. Each line
   * restates a fact a section below already holds and adds none, so the full text stays what applies.
   */
  summary: readonly LegalSummaryItem[];
  intro: string;
  sections: readonly LegalSection[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Updated November 23, 2026": the date written out, the same on every phone (no locale). */
export function updatedLine(iso: string = LEGAL_UPDATED): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return 'Updated recently';
  return `Updated ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The contact line, or null while no address is set. */
export function contactLine(email: string = CONTACT_EMAIL): string | null {
  const e = email.trim();
  return e ? `Questions about these pages: ${e}` : null;
}

export const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Terms',
  subtitle: 'Terms of use',
  summary: [
    { id: 'medical', text: 'A tracking tool, not medical advice. Its numbers are estimates.' },
    { id: 'free', text: 'Everything on your phone is free, with no ads. So are the account and sync.' },
    { id: 'plus', text: `${PLUS} is optional. It renews until you cancel in the plan screen.` },
    { id: 'yours', text: 'You can export your data or delete your account at any time.' },
    { id: 'age', text: 'For people aged 16 and over. The AI coach is for 18 and over.' },
  ],
  intro: 'These terms are the agreement between you and HealthCal for using the app on Android, iPhone and the web. They are written to be read. Using HealthCal means you accept them.',
  sections: [
    {
      id: 'what',
      heading: 'What HealthCal is',
      paragraphs: [
        'HealthCal is a tracker for food, water, training, sleep and weight. It works on your phone without an account. An account adds backup, sync between your devices, friends and the AI features.',
      ],
    },
    {
      id: 'medical',
      heading: 'Not medical advice',
      paragraphs: [
        'HealthCal is a tracking tool, not a medical device, and nothing in it is medical advice. Its calorie and nutrient figures, calorie burn and AI estimates are estimates for healthy adults. They are shown with a range or a plain label because they can be off.',
        'If you are pregnant or breastfeeding, or have diabetes, kidney disease, an eating disorder or another medical condition, talk to a doctor or registered dietitian before changing how you eat or train. If you are at risk of harm now, call your local emergency number.',
        'AI answers and estimates can be wrong. Check them before you rely on them.',
      ],
    },
    {
      id: 'who',
      heading: 'Who can use it',
      paragraphs: ['HealthCal is for people aged 16 and over. The AI coach is for people aged 18 and over.'],
    },
    {
      id: 'account',
      heading: 'Your account',
      paragraphs: [
        'An account is free and optional. One account is for one person. Keep your password to yourself, and change it if you think someone else has used your account.',
        'You can delete your account at any time from Account in the app.',
      ],
    },
    {
      id: 'free',
      heading: 'The free plan',
      jump: 'Free plan',
      paragraphs: [
        'Everything HealthCal does on your phone is free: logging, search, barcodes, the diary, water, training, health sync, progress, reminders, every look and full export. So are the account with backup and sync, friends, the coach’s answers worked out on your phone, and a daily allowance of AI estimates and coach questions. There are no ads.',
        `Nothing that runs on your phone becomes paid. The size of the daily AI allowance is set by HealthCal and is shown wherever a limit is reached, and ${PLUS} is offered where the app shows it and nowhere else.`,
      ],
    },
    {
      id: 'plus',
      heading: PLUS_FULL,
      jump: 'Plus',
      paragraphs: [
        `${PLUS} is an optional subscription. It adds a larger daily allowance of AI estimates and coach questions, and the coach remembers more of your chat. The plan screen in the app shows the current figures for both plans.`,
        `Before you pay, the plan screen and the checkout show the price, the currency and the period, a month or a year. ${PLUS} is sold by a payment company that acts as the seller: it takes the payment and sends the receipt, and its checkout terms apply to the purchase as well.`,
      ],
    },
    {
      id: 'renewal',
      heading: 'Renewal and cancelling',
      jump: 'Cancelling',
      paragraphs: [
        `${PLUS} renews by itself at the end of each period, until you cancel, at the price you subscribed at unless you are told of a change before it applies to a renewal.`,
        `You can cancel at any time from the plan screen, with "Manage or cancel". ${PLUS} then stays until the end of the period you have paid for, and nothing more is charged. After that your account carries on with the free plan and all its data.`,
        `If a renewal payment does not go through, ${PLUS} stays for 7 days while the payment company tries again. After that the account moves to the free plan.`,
      ],
    },
    {
      id: 'refunds',
      heading: 'Refunds and the right to withdraw',
      jump: 'Refunds',
      paragraphs: [
        'Refunds are handled by the payment company under its checkout terms. Where the law where you live gives you a right to withdraw from the purchase or to a refund, you have that right, and nothing in these terms takes it away.',
        'Soon after you subscribe, the plan screen also offers "Withdraw from the contract", which leads to the payment company’s page for it.',
      ],
    },
    {
      id: 'fair-use',
      heading: 'Fair use of the AI',
      jump: 'AI fair use',
      paragraphs: [
        'Every AI estimate and coach answer runs on paid servers, so each account has a daily allowance that starts again each day. Use the AI for your own food and training questions. Do not share an account, send questions by script or other automation, or try to get around the allowance or the AI’s safeguards.',
        'HealthCal may pause the AI features for an account used that way, or for everyone on a day the AI service is busy. The rest of the app keeps working. The daily figures can change, and the plan screen always shows the current ones.',
      ],
    },
    {
      id: 'content',
      heading: 'Your content',
      paragraphs: [
        'What you log, the foods and meals you create, and the photos and words you send for an estimate are yours. You give HealthCal permission to store, copy and process them to run the app for you: to keep them on your devices and in your account, and to send them to the AI when you ask. They are not used for anything else.',
        'Do not send photos or words that belong to someone else without their permission, or that break the law.',
      ],
    },
    {
      id: 'ending',
      heading: 'Ending your account',
      paragraphs: [
        `Deleting your account removes it and everything stored with it on HealthCal’s server. If you have ${PLUS}, the app ends it at the payment company first, so that nothing more is charged. If the plan cannot be ended at that moment, the app says so and tells you how to cancel it at the payment company. Whether any part of the current period is refunded follows the section on refunds.`,
        'HealthCal may close an account used to harm other people, the service or its AI, and tells you first where it can. If HealthCal ever stops running its server, the app says so ahead of time so you can export your data, and everything on your phone keeps working.',
      ],
    },
    {
      id: 'warranty',
      heading: 'No guarantee',
      paragraphs: [
        'HealthCal is provided as it is. Its makers work to keep its numbers sound and its server running, but cannot promise that it is free of errors, always available, or that an estimate is right.',
        'As far as the law allows, HealthCal is not liable for losses that come from relying on its estimates or from the service being unavailable. Nothing in these terms limits a right that the law where you live gives you and that an agreement cannot set aside.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      jump: 'Changes',
      paragraphs: [
        `If these terms change, the date at the top changes with them. A change that affects what you pay or what ${PLUS} gives is shown in the app before it applies to you.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy',
  subtitle: 'What happens to your data',
  summary: [
    { id: 'device', text: 'Without an account, everything you log stays on this device.' },
    { id: 'account', text: 'With an account, it is kept in your private space so it can back up and sync. No other account can read it.' },
    { id: 'friends', text: 'Friends are off until you turn them on; then a friend sees your workouts and streak, never your food or weight.' },
    { id: 'ads', text: 'No ads, no tracking, no analytics and no selling of data.' },
    { id: 'ai', text: 'The AI gets what you give it once you agree; the coach adds your last few questions and answers and, if shared, a week summary.' },
    { id: 'yours', text: 'You can export everything you log or delete it at any time; the coach chat and meal photos stay on this phone.' },
  ],
  intro: 'HealthCal is built to keep your data on your phone. This page says what leaves it, when, where it goes and what is kept, for the app on Android, iPhone and the web.',
  sections: [
    {
      id: 'short',
      heading: 'In short',
      paragraphs: [
        'Everything you log stays on this device unless you create an account. With an account it is kept in your private space on HealthCal’s server so it can back up and sync, and no other account can read it. Friends, if you turn them on, see your workouts and streak.',
        'No ads, no tracking, no analytics and no selling of data. You can export everything you log or delete it at any time.',
      ],
    },
    {
      id: 'device',
      heading: 'On your phone',
      paragraphs: [
        'Without an account, your diary, water, workouts, weights, sleep, goals and settings are stored on this device and nowhere else. On the web, this device means this browser’s storage: clearing the site’s data clears them.',
        'Some things stay on the phone even with an account: daily steps and the day’s calories burned read from a health app, the coach chat, your meal photos, and your agreements to the AI features.',
        'Reminders are scheduled on the phone itself. No server sends them.',
      ],
    },
    {
      id: 'account',
      heading: 'With an account',
      paragraphs: [
        'An account is free and optional. It holds your email address and a password, or a sign-in with Google. What you log is copied to your private space on HealthCal’s server so it can back up and sync between your devices: your profile (name, date of birth, sex, height, weight, goal weight and calorie target), your diary, own foods, saved meals and favourites, water, workouts, weights, body measurements, sleep, fasting, goals and settings.',
        'Each account can read and change its own data and nothing else. The server checks this on every request. The server reads your date of birth for one thing: the age rule of the AI coach.',
        'If you sign in with Google, Google tells HealthCal’s sign-in service your email address and the name and picture on your Google account. HealthCal uses the email address to know your account. The sign-in service keeps the name and picture with your account, and they are deleted with it; the app does not show or use them.',
      ],
    },
    {
      id: 'food-data',
      heading: 'Food search and barcodes',
      jump: 'Food search',
      paragraphs: [
        'Searching the built-in foods happens on the phone. When you scan a barcode or search for a packaged product online, the barcode or the words you typed are sent to Open Food Facts, a free public database of products, either straight from the phone or through HealthCal’s server. Nothing else goes with them.',
      ],
    },
    {
      id: 'ai-estimate',
      heading: 'AI food estimates',
      jump: 'AI estimates',
      paragraphs: [
        'A meal photo or description leaves the phone when you ask for an estimate, after you have agreed once on this device. What is sent is a smaller copy of the photo with any note or weighed total you add, or the words you typed.',
        'It goes to HealthCal’s server, which passes it to Anthropic, the maker of Claude, so its AI can estimate the foods and portions. Nothing else from your diary goes with it: not your name, email, body weight, goals or history.',
        'HealthCal’s server does not store the photo or the words. It records how many estimates you asked for and how large they were, for the daily allowance. Anthropic handles what it receives under its own terms.',
        'When you add an estimate made from a photo, a small copy of the photo is kept on this phone as your meal photos, with the diary entries it added. It is never uploaded, synced or put in the export. Deleting the photo, or every entry it added, removes it, and erasing this device removes them all. Meal photos, in Profile, can stop keeping them.',
      ],
    },
    {
      id: 'coach',
      heading: 'The AI coach',
      jump: 'AI coach',
      paragraphs: [
        'Answers marked "From your data, on this phone" are worked out on the phone and never sent.',
        'A question you type goes to HealthCal’s server and on to Anthropic, after you have agreed once on this device, with your last few typed questions and the coach’s answers to them. A short summary of your week goes with it while "Share my week" is on, and never otherwise; the coach shows that summary word for word. It never holds your name, email, body weight, age, notes or food names.',
        'HealthCal’s server keeps a daily count of your questions, not the words. Anthropic does not use them to train its models and normally deletes them within 30 days, longer if its safety checks flag a message. The chat itself is kept on this phone and is not in the export.',
      ],
    },
    {
      id: 'reports',
      heading: 'Reporting an AI answer',
      jump: 'Reporting',
      paragraphs: [
        'If you report an answer, HealthCal’s server keeps the answer as it was shown, the reason you chose and, if you tick the box, your question, so the report can be looked at. Nothing else goes with it. Reports are kept with your account and deleted with it. Up to 20 reports can be sent in any 24 hours.',
      ],
    },
    {
      id: 'health',
      heading: 'Health Connect and Apple Health',
      jump: 'Health',
      paragraphs: [
        'Workout sync is off until you switch it on. It then reads what you allow: workouts with their calories, distance and heart rate, daily steps, how long you slept, weigh-ins with body fat, and the calories you burn in a day. Nothing is ever written back.',
        'Workouts, nights of sleep and weigh-ins are kept like ones you enter yourself, in your account if you have one. Steps stay on the phone for 35 days and the day’s calories burned for 14. The Health app’s export file is read on the phone, when you pick it and not before. Steps, sleep and the day’s calories burned are never added to your calories.',
        'This data is never sent to the AI food estimate, used for ads or shared with anyone else. It reaches the AI coach inside the summary of your week, and then when you choose to share it; on iPhone, nothing from Apple Health goes into that summary. Friends see what the next section says.',
      ],
    },
    {
      id: 'friends',
      heading: 'Friends',
      paragraphs: [
        'Friends need an account and are off until you turn them on. A friend sees your display name, your active minutes, sessions and streak, and your recent workouts with their name, length, distance and date. Friends never see your calories, weight, food, notes, heart rate or the time of day.',
      ],
    },
    {
      id: 'payments',
      heading: `Paying for ${PLUS}`,
      paragraphs: [
        `${PLUS_FULL} is paid through a payment company that is the seller. It takes the payment, keeps your card or other payment details, and handles tax and receipts under its own terms and privacy policy. Your card details never reach HealthCal.`,
        'To start a checkout, HealthCal’s server gives the payment company your account’s email address and a reference to your account, so the plan reaches the right account.',
        'HealthCal’s server keeps whether your plan is active and until when, with the payment company’s reference for your subscription so the two can be matched. It also keeps a list of the payment company’s messages about it. Once the account is deleted, what stays is that list with the payment company’s references for your customer and subscription, so that a later payment message can be matched and the subscription ended.',
      ],
    },
    {
      id: 'export',
      heading: 'Export and deletion',
      paragraphs: [
        'Your data, in Profile, exports everything you logged as a file you keep, and can erase this device. The coach chat and meal photos stay on the phone and are not in the file.',
        `Delete account, under Account, removes your account and everything stored with it on HealthCal’s server, reports included. With an active ${PLUS} plan, the app ends the plan at the payment company first, so that nothing more is charged; if that cannot be done at that moment, the app says so and tells you how to cancel it there. The payment company keeps its own records of past payments, as the law asks of it.`,
      ],
    },
    {
      id: 'children',
      heading: 'Age',
      paragraphs: [
        'HealthCal is for people aged 16 and over: setup asks for your date of birth, and its equations are designed for adults. The AI coach is for people aged 18 and over. HealthCal does not knowingly keep data about anyone younger.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this page',
      jump: 'Changes',
      paragraphs: ['If this page changes, the date at the top changes with it. Before anything new is sent to the AI, the app asks you again.'],
    },
  ],
};

export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY } as const;
