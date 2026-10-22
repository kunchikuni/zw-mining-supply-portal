// The "new RFQ" email, as plain text and HTML. Pure, so it's easy to test and
// to preview. Everything a mine or supplier typed is HTML-escaped in the HTML
// part — an RFQ title must never be able to inject markup into someone's inbox.

export interface AlertRfq {
  id: string;
  title: string;
  description: string;
  quantity?: string | null;
  province?: string | null;
  deadline: Date;
  mine: { name: string };
  category: { name: string };
}

export interface AlertRecipient {
  fullName: string;
  company: { name: string };
}

const SUMMARY_LENGTH = 400;

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
function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function summarise(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SUMMARY_LENGTH) return flat;
  const cut = flat.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : SUMMARY_LENGTH)}…`;
}

export function buildRfqAlert(rfq: AlertRfq, recipient: AlertRecipient, appUrl: string) {
  const link = `${appUrl}/rfqs/${rfq.id}`;
  const account = `${appUrl}/account`;
  const summary = summarise(rfq.description);
  const details: Array<[string, string]> = [
    ['Posted by', rfq.mine.name],
    ['Category', rfq.category.name],
    ...(rfq.quantity ? [['Quantity', rfq.quantity] as [string, string]] : []),
    ...(rfq.province ? [['Province', rfq.province] as [string, string]] : []),
    ['Bids close', `${formatDay(rfq.deadline)}, end of day (Harare time)`],
  ];
  const why = `You're receiving this because ${recipient.company.name} is a verified supplier in ${rfq.category.name} on ZW Supplier Portal.`;

  const subject = `New RFQ in ${rfq.category.name}: ${rfq.title}`;

  const text = [
    `Hi ${recipient.fullName},`,
    '',
    `${rfq.mine.name} has posted a request for quote that matches your company's categories.`,
    '',
    rfq.title,
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    summary,
    '',
    `View the RFQ and bid: ${link}`,
    '',
    '—',
    why,
    `Turn off RFQ alerts: ${account}`,
  ].join('\n');

  const e = escapeHtml;
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#78716c;white-space:nowrap">${e(label)}</td><td style="padding:4px 0;color:#1c1917">${e(value)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;padding:28px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a5d26">New request for quote</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:600;line-height:1.25">${e(rfq.title)}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hi ${e(recipient.fullName)}, ${e(rfq.mine.name)} has posted a request for quote that matches your company's categories.</p>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows}</table>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#44403c">${e(summary)}</p>
<p style="margin:0 0 28px"><a href="${e(link)}" style="display:inline-block;background:#957330;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:6px">View the RFQ and bid</a></p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e">${e(why)} <a href="${e(account)}" style="color:#7a5d26">Turn off RFQ alerts</a>.</p>
</div>
</body></html>`;

  return { subject, text, html };
}
