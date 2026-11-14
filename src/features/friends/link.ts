/**
 * The invite link's form: /friends/add?invite=XXXXXXXX.
 *
 * It is never ?code=: on web the sign-in library reads a ?code= in any address
 * as a sign-in code and sends it to the auth server, which fails and uses up a
 * pending password-reset link. Links made before the change (?code=) still open.
 */
import { normalizeCode } from './summary';

export const INVITE_PARAM = 'invite';

/** The app path an invite opens: '/friends/add?invite=ABCD2345'. */
export function invitePath(code: string, path = '/friends/add'): string {
  const c = normalizeCode(code);
  return c ? `${path}?${INVITE_PARAM}=${c}` : path;
}

type Param = string | string[] | undefined;
const first = (p: Param) => (Array.isArray(p) ? p[0] : p);

/** The code a route was opened with: ?invite=, or an old link's ?code=. */
export function inviteFromParams(params: { invite?: Param; code?: Param }): string {
  return normalizeCode(first(params.invite) ?? first(params.code) ?? '');
}
