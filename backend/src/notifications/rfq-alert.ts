// The "new RFQ" email, as plain text and HTML. Pure, so it's easy to test and
// to preview. The shared layout (email-layout.ts) HTML-escapes everything a
// mine or supplier typed — an RFQ title must never inject markup into an inbox.
import { formatDay, renderEmail } from './email-layout';

export { escapeHtml } from './email-layout';

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

function summarise(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SUMMARY_LENGTH) return flat;
  const cut = flat.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : SUMMARY_LENGTH)}…`;
}

export function buildRfqAlert(rfq: AlertRfq, recipient: AlertRecipient, appUrl: string) {
  return renderEmail(`New RFQ in ${rfq.category.name}: ${rfq.title}`, {
    eyebrow: 'New request for quote',
    title: rfq.title,
    greeting: `Hi ${recipient.fullName},`,
    intro: `${rfq.mine.name} has posted a request for quote that matches your company's categories.`,
    details: [
      ['Posted by', rfq.mine.name],
      ['Category', rfq.category.name],
      ...(rfq.quantity ? [['Quantity', rfq.quantity] as [string, string]] : []),
      ...(rfq.province ? [['Province', rfq.province] as [string, string]] : []),
      ['Bids close', `${formatDay(rfq.deadline)}, end of day (Harare time)`],
    ],
    body: summarise(rfq.description),
    button: { label: 'View the RFQ and bid', href: `${appUrl}/rfqs/${rfq.id}` },
    footer: `You're receiving this because ${recipient.company.name} is a verified supplier in ${rfq.category.name} on ZW Supplier Portal.`,
    footerLink: { label: 'Turn off RFQ alerts', href: `${appUrl}/account` },
  });
}
