import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/services/auth';
import { useStore } from '@/store';

import { clearPendingInvite, loadPendingInvite, shouldOpenPendingInvite, usePendingInviteStore } from './pendingInvite';

/**
 * Called once by the root layout. When an invite code was kept through sign-up
 * (`savePendingInvite`), open /friends/add with it as soon as the person is
 * signed in, through setup and off the sign-up and setup screens, then forget it.
 */
export function usePendingInvite(enabled: boolean): void {
  const pathname = usePathname();
  const signedIn = useAuth((s) => !!s.session);
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const invite = usePendingInviteStore((s) => s.invite);

  useEffect(() => {
    if (enabled) void loadPendingInvite();
  }, [enabled]);

  const code = invite?.code ?? null;
  const open = enabled && shouldOpenPendingInvite({ code, signedIn, onboarded, pathname });
  useEffect(() => {
    if (!open || !code) return;
    void clearPendingInvite();
    router.push(`/friends/add?invite=${code}` as never);
  }, [open, code]);
}
