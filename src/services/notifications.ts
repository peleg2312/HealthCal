/**
 * Reminder scheduling with expo-notifications.
 *
 * Reminders are one-off local notifications for the rest of today and
 * tomorrow morning. Their text is computed when they are scheduled, so the
 * root layout calls `refreshReminders()` on launch, on foreground and after
 * every data change: the plan is rebuilt from the current numbers and only
 * replaces what is scheduled when it actually changed.
 *
 * Some reminders carry action buttons (water "+250 ml", "Repeat yesterday's
 * lunch", weigh-in "Later today"). Every action opens the app, so the
 * response listener always runs and the Undo toast is on screen.
 *
 * Web has no scheduled local notifications: every function is a safe no-op
 * there and `remindersSupported` is false.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { waterAddedToast } from '@/features/food/addedTo';
import { logItems } from '@/features/food/log';
import { planFromStore } from '@/features/settings/planFromStore';
import { mealRepeat, parseReminderAction, snoozeTime, type PlannedReminder, type ReminderCategory } from '@/features/settings/reminderPlanner';
import { today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import { haptic } from '@/ui/haptics';
import { toast } from '@/ui/Toast';

export { planReminders, type PlannedReminder, type PlannerInput, type ReminderKind } from '@/features/settings/reminderPlanner';

export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type ReminderPermission = 'granted' | 'denied' | 'unsupported';

const CHANNEL_ID = 'reminders';
const ID_PREFIX = 'healthcal-';
const SOURCE = 'healthcal-reminder';
/** A snoozed reminder. Kept out of `cancelOurs`, so a re-plan does not drop it. */
const SNOOZE_PREFIX = 'healthcal-snooze-';
const SNOOZE_SOURCE = 'healthcal-snooze';
/** Reminders closer than this to now are skipped: iOS rejects a date trigger that is already past. */
const MIN_LEAD_MS = 5000;

function log(where: string, e: unknown) {
  console.warn(`[reminders] ${where}:`, e instanceof Error ? e.message : e);
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    description: 'Water, meal and daily check-in reminders with your current numbers',
    importance: AndroidImportance.DEFAULT,
    showBadge: false,
  });
}

type ReminderData = { source?: string; url?: string; kind?: string; date?: string; meal?: string };

/** Responses already handled: a cold start can report the same one twice. */
const handled = new Set<string>();

function addWaterFromReminder(ml: number) {
  const s = useStore.getState();
  const units = s.profile?.units ?? 'metric';
  const day = today();
  const entry = s.upsert('water', { date: day, ml, beverage: 'water', loggedAt: nowISO() });
  haptic.success();
  // Worded as a glass on Today is: "250 ml added to Water".
  toast(waterAddedToast(formatVolume(ml, units), day, day), { label: 'Undo', onPress: () => useStore.getState().remove('water', entry.id) });
}

function repeatMealFromReminder(meal: 'breakfast' | 'lunch' | 'dinner', date: string) {
  // Drinks from Water are never copied, and a drink alone does not make the meal "already logged" (mealRepeat).
  const { items, already } = mealRepeat(live(useStore.getState().foodEntries), date, meal);
  if (items.length === 0) {
    toast(`Nothing was logged for ${meal} yesterday`);
    return;
  }
  if (already) {
    toast(`${meal.charAt(0).toUpperCase()}${meal.slice(1)} is already logged today`);
    return;
  }
  logItems(items, meal, date, `Yesterday's ${meal} added`);
}

async function snoozeReminder(content: Notifications.NotificationContent, data: ReminderData) {
  const r = useStore.getState().settings.reminders;
  const at = snoozeTime(new Date(), r.quietStart, r.quietEnd);
  if (!at) {
    toast('Too close to quiet hours to remind you later today');
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: `${SNOOZE_PREFIX}${data.kind ?? 'reminder'}-${data.date ?? today()}`,
    content: {
      title: content.title ?? 'Reminder',
      body: content.body ?? '',
      data: { ...data, source: SNOOZE_SOURCE },
      sound: false,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
  });
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  toast(`Reminder moved to ${clock}`);
}

// When a reminder (or one of its buttons) was last answered. The water and repeat-meal buttons
// do not navigate, so the morning page asks this rather than the route to stay out of their way.
let lastResponse: number | null = null;

/** When a reminder was last answered on this device (ms), or null. */
export const lastReminderResponseAt = (): number | null => lastResponse;

function handleResponse(response: Notifications.NotificationResponse | null | undefined, delayMs: number) {
  if (!response) return;
  const { content, identifier } = response.notification.request;
  const data = content.data as ReminderData | undefined;
  if (!data || (data.source !== SOURCE && data.source !== SNOOZE_SOURCE)) return;
  lastResponse = Date.now();
  const key = `${identifier}|${response.notification.date}|${response.actionIdentifier}`;
  if (handled.has(key)) return;
  handled.add(key);
  const action = parseReminderAction(response.actionIdentifier, data);
  // Give the navigator and the toast host a moment to mount on a cold start.
  setTimeout(() => {
    try {
      if (!action) {
        if (typeof data.url === 'string') router.push(data.url as never);
        return;
      }
      if (action.type === 'water') addWaterFromReminder(action.ml);
      else if (action.type === 'repeat-meal') repeatMealFromReminder(action.meal, action.date);
      else void snoozeReminder(content, data).catch((e) => log('snooze', e));
      // Android leaves the notification in the shade after an action button.
      void Notifications.dismissNotificationAsync(identifier).catch(() => {});
      void refreshReminders();
    } catch (e) {
      log('response', e);
    }
  }, delayMs);
}

let initialized = false;

/** Foreground presentation and tap handling. Runs once, on the first refresh. */
function init() {
  if (initialized || !remindersSupported) return;
  initialized = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // A timer that ends while the app is open is already shown on screen (and felt): no banner on top of it.
        const timer = (notification.request.content.data as { source?: string } | undefined)?.source === TIMER_SOURCE;
        return {
          shouldShowBanner: !timer,
          shouldShowList: !timer,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });
    Notifications.addNotificationResponseReceivedListener((response) => handleResponse(response, 50));
    // App launched by tapping a reminder or one of its buttons.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      handleResponse(last, 600);
      Notifications.clearLastNotificationResponse();
    }
  } catch (e) {
    log('init', e);
  }
}

/** Ask for permission at the moment the user turns reminders on. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'unsupported';
  try {
    // Android 13+ only shows the prompt once a channel exists.
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return asked.granted ? 'granted' : 'denied';
  } catch (e) {
    log('permission', e);
    return 'denied';
  }
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'unsupported';
  try {
    return (await Notifications.getPermissionsAsync()).granted ? 'granted' : 'denied';
  } catch (e) {
    log('permission', e);
    return 'denied';
  }
}

async function cancelOurs(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const data = n.content.data as { source?: string } | undefined;
    if (n.identifier.startsWith(ID_PREFIX) || data?.source === SOURCE) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Drop snoozed reminders whose job is done (the weigh-in was logged). */
async function cancelResolvedSnoozes(): Promise<void> {
  const s = useStore.getState();
  const weighedDates = new Set(live(s.weights).map((w) => w.date));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const data = n.content.data as ReminderData | undefined;
    if (!n.identifier.startsWith(SNOOZE_PREFIX) || data?.source !== SNOOZE_SOURCE) continue;
    const done = !s.settings.reminders.enabled || (data.kind === 'weighin' && !!data.date && weighedDates.has(data.date));
    if (done) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}

function signature(plan: PlannedReminder[]): string {
  return plan.map((p) => `${p.id}|${p.at.getTime()}|${p.title}|${p.body}|${p.category?.identifier ?? ''}|${p.url}`).join('\n');
}

const registeredCategories = new Set<string>();

async function ensureCategories(plan: PlannedReminder[]): Promise<void> {
  const wanted = new Map<string, ReminderCategory>();
  for (const p of plan) if (p.category) wanted.set(p.category.identifier, p.category);
  for (const c of wanted.values()) {
    if (registeredCategories.has(c.identifier)) continue;
    await Notifications.setNotificationCategoryAsync(
      c.identifier,
      c.actions.map((a) => ({ identifier: a.identifier, buttonTitle: a.buttonTitle, options: { opensAppToForeground: true } })),
    );
    registeredCategories.add(c.identifier);
  }
}

async function schedule(plan: PlannedReminder[]): Promise<void> {
  await ensureChannel();
  try {
    await ensureCategories(plan);
  } catch (e) {
    // Without categories the reminders still arrive, just without buttons.
    log('categories', e);
  }
  for (const p of plan) {
    // Planning and the awaits before this can take a moment: a time that has
    // just passed would make iOS throw and stop the rest of the plan.
    if (p.at.getTime() <= Date.now() + MIN_LEAD_MS) continue;
    const categoryIdentifier = p.category && registeredCategories.has(p.category.identifier) ? p.category.identifier : undefined;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${p.id}`,
        content: {
          title: p.title,
          body: p.body,
          data: { source: SOURCE, kind: p.kind, url: p.url, ...p.data },
          sound: false,
          ...(categoryIdentifier ? { categoryIdentifier } : null),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: p.at,
          channelId: CHANNEL_ID,
        },
      });
    } catch (e) {
      log(`schedule ${p.id}`, e);
    }
  }
}

let lastSignature: string | null = null;
let queue: Promise<void> = Promise.resolve();

async function refresh(): Promise<void> {
  init();
  const s = useStore.getState();
  const wanted = s.settings.reminders.enabled && (await getReminderPermission()) === 'granted';
  if (wanted) await cancelResolvedSnoozes().catch((e) => log('snoozes', e));
  if (!wanted) {
    if (lastSignature !== '') {
      await cancelOurs();
      lastSignature = '';
    }
    return;
  }
  const plan = planFromStore(s, new Date());
  const sig = signature(plan);
  // Unchanged plan: what is scheduled is already right.
  if (sig === lastSignature) return;
  await cancelOurs();
  lastSignature = '';
  await schedule(plan);
  lastSignature = sig;
}

/**
 * Rebuild the scheduled reminders from the current data. Never throws.
 * Calls are queued so overlapping refreshes cannot double-schedule.
 */
export function refreshReminders(): Promise<void> {
  if (!remindersSupported) return Promise.resolve();
  queue = queue
    .then(refresh)
    .catch((e) => {
      lastSignature = null;
      log('refresh', e);
    });
  return queue;
}

// ---------------------------------------------------------- timer alerts

const TIMER_CHANNEL_ID = 'timers';
/** Not the reminders' prefix: a reminders refresh cancels everything that carries that one. */
const TIMER_PREFIX = 'hc-timer-';
const TIMER_SOURCE = 'healthcal-timer';

/**
 * A one-off alert at a moment the user just asked for in the app, such as the
 * end of a rest between sets, so it still reaches them with the phone locked.
 * Unlike reminders it has a sound and ignores quiet hours (the user started
 * the timer seconds ago). It never asks for permission: without it, or on web,
 * nothing is scheduled and false is returned. Scheduling the same id again
 * replaces the pending alert. Never throws.
 */
export async function scheduleTimerAlert(id: string, at: Date | number, content: { title: string; body: string; url?: string }): Promise<boolean> {
  if (!remindersSupported) return false;
  try {
    const date = new Date(at);
    if (!(date.getTime() > Date.now() + 1000)) return false;
    if (!(await Notifications.getPermissionsAsync()).granted) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
        name: 'Timers',
        description: 'The end of a rest timer you started',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        showBadge: false,
      });
    }
    const identifier = `${TIMER_PREFIX}${id}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: content.title, body: content.body, data: { source: TIMER_SOURCE, url: content.url }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: TIMER_CHANNEL_ID },
    });
    return true;
  } catch (e) {
    log(`timer ${id}`, e);
    return false;
  }
}

/** Cancel a pending timer alert and clear it from the notification list if it already fired. Never throws. */
export async function cancelTimerAlert(id: string): Promise<void> {
  if (!remindersSupported) return;
  const identifier = `${TIMER_PREFIX}${id}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.dismissNotificationAsync(identifier);
  } catch (e) {
    log(`cancel timer ${id}`, e);
  }
}

/** Remove every scheduled reminder (sign-out, erase data). Never throws. */
export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported) return;
  try {
    await cancelOurs();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) if (n.identifier.startsWith(SNOOZE_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    lastSignature = '';
  } catch (e) {
    log('cancel', e);
  }
}
