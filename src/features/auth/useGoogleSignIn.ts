/**
 * What a screen with "Continue with Google" needs: whether to show it (`ready`: known for this
 * visit; `shown`: decided once, so it never moves what is on screen), a busy state while the flow
 * starts, the tap, the problem line under the button, and `notice` when a tap found Google switched
 * off (the button is then gone and the notice stands in its place). A cancel is a toast
 * ("Nothing changed"); every other problem is a line the screen places under the button.
 */
import { useState } from 'react';

import { haptic, toast } from '@/ui';

import { clearGoogleProblem, startGoogleSignIn } from './google';
import { useGoogleButtonChoice } from './GoogleButton';
import { checkGoogleBeforeTap } from './googleSetting';
import { googleProblemWords, problemIsToast, tapOutcomeWords } from './words';

export function useGoogleSignIn({ onSignedIn, initialError = null }: { onSignedIn: () => void; initialError?: string | null }) {
  const choice = useGoogleButtonChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const press = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Google may have been switched off since this screen was drawn: ask first (2 s at most).
    const off = tapOutcomeWords(await checkGoogleBeforeTap());
    if (off) {
      setBusy(false);
      haptic.warn();
      setNotice(off);
      return;
    }
    const r = await startGoogleSignIn();
    // The web page is leaving for Google: stay busy until it has gone.
    if (r === 'redirecting') return;
    setBusy(false);
    if (r.ok) {
      haptic.success();
      onSignedIn();
      return;
    }
    clearGoogleProblem();
    if (problemIsToast(r.problem)) {
      toast(googleProblemWords(r.problem));
      return;
    }
    haptic.warn();
    setError(googleProblemWords(r.problem));
  };
  return {
    ready: choice.ready,
    shown: choice.shown && !notice,
    busy,
    error,
    notice,
    press: () => void press(),
    clearError: () => setError(null),
  };
}
