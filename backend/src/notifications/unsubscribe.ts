import { createHmac, timingSafeEqual } from 'crypto';

// One-click unsubscribe from new-RFQ alerts, without signing in: what a
// mailbox provider's "Unsubscribe" button (List-Unsubscribe, RFC 8058) and the
// alert's footer link use. The token is the user's id plus an HMAC of it, so
// it can't be forged or pointed at someone else; it never expires, so the link
// in an old email keeps working; and it can only ever turn RFQ alerts off.
// The HMAC key is derived from JWT_SECRET, kept apart from token signing by a
// purpose prefix.

const PURPOSE = 'rfq-alerts';

function sign(secret: string, userId: string): string {
  return createHmac('sha256', `unsubscribe:${secret}`).update(`${PURPOSE}:${userId}`).digest('base64url');
}

export function unsubscribeToken(secret: string, userId: string): string {
  return `${userId}.${sign(secret, userId)}`;
}

// The user id the token was made for, or null if it's not a valid token.
export function verifyUnsubscribeToken(secret: string, token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(secret, userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

export interface UnsubscribeConfig {
  secret: string;
  apiUrl: string; // the backend, for the one-click POST
  appUrl: string; // the frontend, for the page a person lands on
}

// The API's public address for links in emails, without a trailing slash.
export function apiUrlFrom(config: { get<T = string>(key: string): T | undefined }): string {
  return (config.get<string>('API_URL') || 'http://localhost:3000').replace(/\/+$/, '');
}

// The footer link (a page that asks before turning alerts off — link
// scanners follow GETs) and the headers for mailbox providers' button, which
// POSTs straight to the API.
export function unsubscribeLinks(c: UnsubscribeConfig, userId: string) {
  const token = encodeURIComponent(unsubscribeToken(c.secret, userId));
  return {
    pageUrl: `${c.appUrl}/unsubscribe?token=${token}`,
    headers: {
      'List-Unsubscribe': `<${c.apiUrl}/email/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
