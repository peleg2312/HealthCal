import { describe, expect, it } from 'vitest';

import { inviteFromParams, invitePath } from './link';

describe('invite links', () => {
  it('use ?invite=, never ?code= (the sign-in library reads ?code= on web)', () => {
    expect(invitePath('abcd 2345')).toBe('/friends/add?invite=ABCD2345');
    expect(invitePath('ABCD2345', '/friends')).toBe('/friends?invite=ABCD2345');
    expect(invitePath('ABCD2345')).not.toContain('code=');
    expect(invitePath('')).toBe('/friends/add');
  });

  it('read ?invite=, and an old link’s ?code=', () => {
    expect(inviteFromParams({ invite: 'ABCD2345' })).toBe('ABCD2345');
    expect(inviteFromParams({ code: 'abcd-2345' })).toBe('ABCD2345');
    expect(inviteFromParams({ invite: 'ABCD2345', code: 'WXYZ6789' })).toBe('ABCD2345');
    expect(inviteFromParams({ invite: ['ABCD2345', 'X'] })).toBe('ABCD2345');
    expect(inviteFromParams({})).toBe('');
  });
});
