// What a company is told about its verification and its documents: a
// verifier's decision, a document lapsing, a document about to lapse. Pure,
// like rfq-alert.ts; the layout escapes everything.
import { formatDay, renderEmail } from './email-layout';

export type CompanyKind = 'MINE' | 'SUPPLIER' | 'PLATFORM';

export interface UpdateCompany {
  id: string;
  name: string;
  type: CompanyKind;
}

export interface UpdateRecipient {
  fullName: string;
}

// "tax clearance" — as in DOCUMENT_NAMES — and its capitalised form.
export interface DocumentLabel {
  name: string;
  expiresAt: Date | null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function base(company: UpdateCompany, recipient: UpdateRecipient, appUrl: string) {
  return {
    title: company.name,
    greeting: `Hi ${recipient.fullName},`,
    button: { label: 'View your company profile', href: `${appUrl}/companies/${company.id}` },
    footer: `You're receiving this because you're a member of ${company.name} on ZW Supplier Portal.`,
    footerLink: { label: 'Your account', href: `${appUrl}/account` },
  };
}

// What verification means for this kind of company, for the emails below.
const canBid = (company: UpdateCompany) =>
  company.type === 'SUPPLIER'
    ? "You can now bid on requests for quote in your categories, and you'll get an email when a new one is posted."
    : 'Your company now shows as verified in the directory.';
const losesBidding = (company: UpdateCompany) =>
  company.type === 'SUPPLIER' ? " and can't bid on requests for quote until it's verified again" : '';

export type VerificationNews = 'VERIFIED' | 'DECLINED' | 'NO_LONGER_VERIFIED';

const STATUS_LABELS: Record<string, string> = {
  VERIFIED: 'Verified',
  REJECTED: 'Declined',
  PENDING: 'Waiting for review',
  UNVERIFIED: 'Not verified',
};

export function buildVerificationEmail(
  news: VerificationNews,
  status: string,
  company: UpdateCompany,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  const details: Array<[string, string]> = [
    ['Company', company.name],
    ['Status', STATUS_LABELS[status] ?? status],
  ];
  if (news === 'VERIFIED') {
    return renderEmail(`${company.name} is verified on ZW Supplier Portal`, {
      ...base(company, recipient, appUrl),
      eyebrow: 'Company verified',
      intro: `A verifier has verified ${company.name}.`,
      details,
      body: canBid(company),
    });
  }
  if (news === 'DECLINED') {
    return renderEmail(`Verification declined: ${company.name}`, {
      ...base(company, recipient, appUrl),
      eyebrow: 'Verification declined',
      intro: `A verifier has declined ${company.name}'s verification.`,
      details,
      body: "Check the notes on your documents, then upload what's missing or out of date. Uploading a document puts your company back in the queue for review.",
    });
  }
  return renderEmail(`${company.name} is no longer verified`, {
    ...base(company, recipient, appUrl),
    eyebrow: 'Verification removed',
    intro: `A verifier has changed ${company.name}'s status, so it's no longer verified${losesBidding(company)}.`,
    details,
  });
}

export function buildDocumentReviewedEmail(
  approved: boolean,
  doc: DocumentLabel,
  reviewNote: string | null,
  company: UpdateCompany,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  if (approved) {
    return renderEmail(`Your ${doc.name} was approved`, {
      ...base(company, recipient, appUrl),
      eyebrow: 'Document approved',
      intro: `A verifier approved the ${doc.name} ${company.name} uploaded.`,
      details: [
        ['Document', capitalise(doc.name)],
        ['Valid until', doc.expiresAt ? formatDay(doc.expiresAt) : "Doesn't expire"],
      ],
    });
  }
  return renderEmail(`Your ${doc.name} was rejected`, {
    ...base(company, recipient, appUrl),
    eyebrow: 'Document rejected',
    intro: `A verifier rejected the ${doc.name} ${company.name} uploaded.`,
    details: [
      ['Document', capitalise(doc.name)],
      ['Reason', reviewNote ?? 'No reason given'],
    ],
    body: 'Upload a corrected one from your company profile and a verifier will review it.',
  });
}

// An approved document passed its expiry date (`lostVerification` when that
// cost the company its verification), or a pending one did before review.
export function buildDocumentExpiredEmail(
  wasApproved: boolean,
  lostVerification: boolean,
  doc: DocumentLabel & { expiresAt: Date },
  company: UpdateCompany,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  const details: Array<[string, string]> = [
    ['Document', capitalise(doc.name)],
    ['Expired', formatDay(doc.expiresAt)],
  ];
  if (!wasApproved) {
    return renderEmail(`Your ${doc.name} expired before it was reviewed`, {
      ...base(company, recipient, appUrl),
      eyebrow: 'Document expired',
      intro: `The ${doc.name} ${company.name} uploaded expired before a verifier reviewed it.`,
      details,
      body: 'Upload the current one from your company profile and a verifier will review it.',
    });
  }
  return renderEmail(`Your ${doc.name} has expired`, {
    ...base(company, recipient, appUrl),
    eyebrow: 'Document expired',
    intro: `The ${doc.name} on file for ${company.name} has expired.`,
    details,
    body: lostVerification
      ? `${company.name} is no longer verified${losesBidding(company)}. Upload the current ${doc.name} and a verifier will review it.`
      : `Upload the current ${doc.name} from your company profile to keep it up to date.`,
  });
}

// `verified`: whether the company is VERIFIED now, i.e. has verification to lose.
export function buildExpiryReminderEmail(
  daysLeft: number,
  verified: boolean,
  doc: DocumentLabel & { expiresAt: Date },
  company: UpdateCompany,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  const when = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return renderEmail(`Your ${doc.name} expires on ${formatDay(doc.expiresAt)}`, {
    ...base(company, recipient, appUrl),
    eyebrow: 'Document expiring soon',
    intro: `The ${doc.name} on file for ${company.name} expires ${when}.`,
    details: [
      ['Document', capitalise(doc.name)],
      ['Valid until', `${formatDay(doc.expiresAt)}, end of day (Harare time)`],
    ],
    body: verified
      ? `Upload the renewed one before then. If it lapses without an approved renewal, ${company.name} loses its verification${losesBidding(company)}.`
      : 'Upload the renewed one from your company profile before then.',
  });
}
