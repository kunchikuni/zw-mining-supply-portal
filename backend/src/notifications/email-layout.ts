// The one look every portal email shares, as plain text and HTML. Content is
// plain text: everything is HTML-escaped here, so nothing a mine or supplier
// typed can inject markup into someone's inbox.

export interface EmailContent {
  eyebrow: string; // small caps line above the title, e.g. "New request for quote"
  title: string;
  greeting: string; // "Hi Ann,"
  intro: string;
  details: Array<[string, string]>;
  body?: string;
  button: { label: string; href: string };
  footer: string; // why the recipient got this
  footerLink: { label: string; href: string };
}

// The frontend's address for links in emails, without a trailing slash.
export function appUrlFrom(config: { get<T = string>(key: string): T | undefined }): string {
  return (config.get<string>('APP_URL') || 'http://localhost:3001').replace(/\/+$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The deadline is a calendar date stored as midnight UTC, so it's formatted in
// UTC to get the date the mine picked: "24 Oct 2026".
export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function renderText(c: EmailContent): string {
  return [
    c.greeting,
    '',
    c.intro,
    '',
    c.title,
    ...c.details.map(([label, value]) => `${label}: ${value}`),
    ...(c.body ? ['', c.body] : []),
    '',
    `${c.button.label}: ${c.button.href}`,
    '',
    '—',
    c.footer,
    `${c.footerLink.label}: ${c.footerLink.href}`,
  ].join('\n');
}

export function renderHtml(c: EmailContent): string {
  const e = escapeHtml;
  const rows = c.details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#78716c;white-space:nowrap">${e(label)}</td><td style="padding:4px 0;color:#1c1917">${e(value)}</td></tr>`,
    )
    .join('');
  const body = c.body
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#44403c">${e(c.body)}</p>\n`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;padding:28px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a5d26">${e(c.eyebrow)}</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:600;line-height:1.25">${e(c.title)}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6">${e(c.greeting)} ${e(c.intro)}</p>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows}</table>
${body}<p style="margin:0 0 28px"><a href="${e(c.button.href)}" style="display:inline-block;background:#957330;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:6px">${e(c.button.label)}</a></p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e">${e(c.footer)} <a href="${e(c.footerLink.href)}" style="color:#7a5d26">${e(c.footerLink.label)}</a>.</p>
</div>
</body></html>`;
}

export function renderEmail(subject: string, content: EmailContent) {
  return { subject, text: renderText(content), html: renderHtml(content) };
}
