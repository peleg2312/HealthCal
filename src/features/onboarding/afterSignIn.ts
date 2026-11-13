import { useAuth } from '@/services/auth';
import { useStore } from '@/store';

/**
 * Resolve once the first sync after sign-in has finished, so an existing
 * profile has been pulled before deciding where to go. `restoring` is set by
 * the auth listener when the SIGNED_IN event fires; give it a moment to start
 * before trusting a `false`, and never wait forever (the app is local-first).
 */
export function waitForRestore({ startGraceMs = 1500, maxMs = 20000 } = {}): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    let sawRestoring = useAuth.getState().restoring;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsub();
      clearInterval(timer);
      resolve();
    };
    const check = () => {
      const s = useAuth.getState();
      if (s.restoring) sawRestoring = true;
      const elapsed = Date.now() - started;
      if (elapsed > maxMs) return finish();
      if (s.session && !s.restoring && (sawRestoring || elapsed > startGraceMs)) finish();
    };
    const unsub = useAuth.subscribe(check);
    const timer = setInterval(check, 200);
    check();
  });
}

/** Where a freshly signed-in person belongs: their dashboard, or onboarding if no profile exists yet. */
export function destinationAfterSignIn(): '/' | '/onboarding' {
  return useStore.getState().profile?.onboardedAt ? '/' : '/onboarding';
}
