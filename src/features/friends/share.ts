/**
 * Invite links and sharing them: the system share sheet on phones, the Web
 * Share API (or a copy) on web. The link opens /friends/add with the code filled in.
 */
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { toast } from '@/ui';

import { formatCode, normalizeCode } from './summary';

/** healthcal://friends/add?code=XXXXXXXX on a phone; the same path on this site on web. */
export function inviteLink(code: string): string {
  const c = normalizeCode(code);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/friends/add?code=${c}`;
  }
  return Linking.createURL('/friends/add', { queryParams: { code: c } });
}

export function inviteMessage(code: string): string {
  return `Add me as a friend on HealthCal with my code ${formatCode(code)}, or open ${inviteLink(code)}`;
}

/** Copy text and say so. Returns whether it worked. */
export async function copyText(text: string, done = 'Copied'): Promise<boolean> {
  try {
    const ok = await Clipboard.setStringAsync(text);
    toast(ok ? done : 'Could not copy. Select the code and copy it yourself.');
    return ok;
  } catch {
    toast('Could not copy. Select the code and copy it yourself.');
    return false;
  }
}

/** Read the clipboard for a code to paste. Empty when there is nothing or permission was refused. */
export async function pasteText(): Promise<string> {
  try {
    return await Clipboard.getStringAsync();
  } catch {
    return '';
  }
}

/** Share the invite: the system sheet on phones, Web Share where the browser has it, else copy the link. */
export async function shareInvite(code: string): Promise<void> {
  const message = inviteMessage(code);
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: 'Add me on HealthCal', text: `Add me as a friend on HealthCal with my code ${formatCode(code)}`, url: inviteLink(code) });
        return;
      } catch (e) {
        // Closing the share sheet is not an error worth a message.
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    await copyText(inviteLink(code), 'Invite link copied');
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    await copyText(inviteLink(code), 'Invite link copied');
  }
}
