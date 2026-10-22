import { unsubscribeLinks, unsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

const SECRET = 'jwt-secret-for-tests';
const USER = '3f1c2b9a-0000-4000-8000-000000000001';

describe('unsubscribe tokens', () => {
  it('round-trips to the user it was made for', () => {
    expect(verifyUnsubscribeToken(SECRET, unsubscribeToken(SECRET, USER))).toBe(USER);
  });

  it("can't be pointed at another user", () => {
    const sig = unsubscribeToken(SECRET, USER).split('.')[1];
    expect(verifyUnsubscribeToken(SECRET, `someone-else.${sig}`)).toBeNull();
  });

  it('rejects a tampered signature, a token from another secret, and junk', () => {
    const token = unsubscribeToken(SECRET, USER);
    expect(verifyUnsubscribeToken(SECRET, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(verifyUnsubscribeToken('another-secret', token)).toBeNull();
    for (const junk of [undefined, '', 'no-dot', `.${token.split('.')[1]}`, `${USER}.`]) {
      expect(verifyUnsubscribeToken(SECRET, junk)).toBeNull();
    }
  });

  it("isn't the JWT signature: the key is derived for this purpose", () => {
    expect(unsubscribeToken(SECRET, USER)).not.toContain(SECRET);
  });
});

describe('unsubscribeLinks', () => {
  const links = unsubscribeLinks({ secret: SECRET, apiUrl: 'https://api.example', appUrl: 'https://portal.example' }, USER);
  const token = encodeURIComponent(unsubscribeToken(SECRET, USER));

  it('gives mailbox providers a one-click POST to the API (RFC 8058)', () => {
    expect(links.headers).toEqual({
      'List-Unsubscribe': `<https://api.example/email/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('gives people a page on the frontend that asks first', () => {
    expect(links.pageUrl).toBe(`https://portal.example/unsubscribe?token=${token}`);
  });
});
