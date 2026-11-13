/**
 * Reminder scheduling with expo-notifications.
 *
 * Reminders are one-off local notifications for the rest of today and
 * tomorrow morning. Their text is computed when they are scheduled, so the
 * root layout calls `refreshReminders()` on launch, on foreground and after
 * every data change: the plan is rebuilt from the current numbers and only
 * replaces what is scheduled when it actually changed.
 *
 * Web has no scheduled local notifications: every function is a safe no-op
 * there and `remindersSupported` is false.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { planFromStore } from '@/features/settings/planFromStore';
import { REMINDER_ROUTES, type PlannedReminder } from '@/features/settings/reminderPlanner';
import { useStore } from '@/store';

export { planReminders, type PlannedReminder, type PlannerInput, type ReminderKind } from '@/features/settings/reminderPlanner';

export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type ReminderPermission = 'granted' | 'denied' | 'unsupported';

const CHANNEL_ID = 'reminders';
const ID_PREFIX = 'healthcal-';
const SOURCE = 'healthcal-reminder';

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

function openFromResponse(response: Notifications.NotificationResponse | null | undefined) {
  const data = response?.notification.request.content.data as { source?: string; url?: string } | undefined;
  if (!data || data.source !== SOURCE || typeof data.url !== 'string') return;
  const url = data.url;
  // Give the navigator a moment to mount on a cold start.
  setTimeout(() => {
    try {
      router.push(url as never);
    } catch (e) {
      log('open', e);
    }
  }, 50);
}

let initialized = false;

/** Foreground presentation and tap handling. Runs once, on the first refresh. */
function init() {
  if (initialized || !remindersSupported) return;
  initialized = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    Notifications.addNotificationResponseReceivedListener((response) => openFromResponse(response));
    // App launched by tapping a reminder.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      openFromResponse(last);
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

function signature(plan: PlannedReminder[]): string {
  return plan.map((p) => `${p.id}|${p.at.getTime()}|${p.title}|${p.body}`).join('\n');
}

async function schedule(plan: PlannedReminder[]): Promise<void> {
  await ensureChannel();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_PREFIX}${p.id}`,
      content: {
        title: p.title,
        body: p.body,
        data: { source: SOURCE, kind: p.kind, url: REMINDER_ROUTES[p.kind] },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.at,
        channelId: CHANNEL_ID,
      },
    });
  }
}

let lastSignature: string | null = null;
let queue: Promise<void> = Promise.resolve();

async function refresh(): Promise<void> {
  init();
  const s = useStore.getState();
  const wanted = s.settings.reminders.enabled && (await getReminderPermission()) === 'granted';
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

/** Remove every scheduled reminder (sign-out, erase data). Never throws. */
export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported) return;
  try {
    await cancelOurs();
    lastSignature = '';
  } catch (e) {
    log('cancel', e);
  }
}
