// PLATFORM is the portal operator's own company (verifier / admin accounts);
// it never appears in the directory or at signup.
export type CompanyType = 'MINE' | 'SUPPLIER' | 'PLATFORM';

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export type DocumentType =
  | 'COMPANY_REGISTRATION'
  | 'TAX_CLEARANCE'
  | 'NSSA_COMPLIANCE'
  | 'PRAZ_REGISTRATION'
  | 'SAFETY_CERTIFICATE'
  | 'QUALITY_CERTIFICATE'
  | 'OTHER';

export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type RfqStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

// SUPERSEDED: replaced by the supplier's revised bid. Listings never show one
// at the top level, only inside the current bid's `history`.
export type BidStatus =
  | 'SUBMITTED'
  | 'SHORTLISTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'SUPERSEDED';

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface CompanyCategory {
  categoryId: string;
  category: Category;
}

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  province?: string | null;
  town?: string | null;
  registrationNumber?: string | null;
  verificationStatus: VerificationStatus;
  isLocallyOwned: boolean;
  yearsOperating?: number | null;
  description?: string | null;
  createdAt: string;
  categories?: CompanyCategory[];
  documents?: DocumentRecord[];
  // On GET /companies/:id, newest first.
  ratingsReceived?: ReceivedRating[];
}

// A rating as a company profile shows it: score, comment and date only. The
// author and the RFQ are left out on purpose — together they'd say who won
// which RFQ, which sealed bids keep private.
export interface ReceivedRating {
  id: string;
  score: number;
  comment?: string | null;
  createdAt: string;
}

// A rating the posting mine gave a supplier on one of its own RFQs.
export interface RfqRating extends ReceivedRating {
  ratedCompanyId: string;
}

// What POST /companies returns: the company plus the one-time code that
// makes its first user the company admin (see registerUser).
export interface CreatedCompany extends Company {
  inviteCode: string;
}

export interface DocumentRecord {
  id: string;
  companyId: string;
  docType: DocumentType;
  // Empty for visitors: only the owning company and verifiers get the link.
  fileUrl: string;
  status: DocumentStatus;
  uploadedAt: string;
  // A calendar date (stored as midnight UTC): valid through that day in
  // Harare. Required for tax clearance, NSSA and PRAZ; never set on a company
  // registration. Confirmed by the verifier on approval.
  expiresAt?: string | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  // Only on the verifier's review queue.
  company?: Pick<Company, 'id' | 'name' | 'type' | 'verificationStatus'>;
}

// A company waiting on a verifier's decision (GET /companies/verification-queue).
export interface VerificationQueueCompany {
  id: string;
  name: string;
  type: CompanyType;
  province?: string | null;
  town?: string | null;
  verificationStatus: VerificationStatus;
  updatedAt: string;
  documents: Pick<DocumentRecord, 'id' | 'docType' | 'status' | 'uploadedAt' | 'expiresAt'>[];
  // Types it had approved that have lapsed with no approved renewal: the
  // server won't verify it until these are renewed and approved.
  lapsedDocTypes: DocumentType[];
}

export interface Rfq {
  id: string;
  mineCompanyId: string;
  mine?: Company;
  categoryId: string;
  category?: Category;
  title: string;
  description: string;
  quantity?: string | null;
  province?: string | null;
  deadline: string;
  status: RfqStatus;
  // Derived by the API: OPEN *and* still inside its bidding window. An RFQ
  // past its deadline stays status OPEN until its mine acts, so `status`
  // alone doesn't say whether a bid will be accepted.
  biddingOpen: boolean;
  createdAt: string;
  // Sealed: on GET /rfqs/:id this is every bid for the posting mine, only the
  // caller's own for a bidder, and empty for anyone else.
  bids?: Bid[];
  // Total bids on the RFQ, visible to everyone. On GET /rfqs/:id and /rfqs/mine.
  _count?: { bids: number };
  // On GET /rfqs/:id, only for whoever sees every bid (the posting mine or a
  // platform admin): the ratings the mine has given its accepted suppliers.
  // Absent for everyone else, because a rating reveals who won.
  ratings?: RfqRating[];
}

export interface Bid {
  id: string;
  rfqId: string;
  supplierCompanyId: string;
  supplier?: Company;
  // Only on GET /bids/mine: the RFQ this bid was placed on, with `mine`,
  // `category` and `biddingOpen` filled in.
  rfq?: Rfq;
  amount: string;
  currency: string;
  leadTimeDays?: number | null;
  notes?: string | null;
  status: BidStatus;
  submittedAt: string;
  // The bid this one revised, if any.
  revisionOfId?: string | null;
  // On every bid listing: the versions this bid replaced, newest first
  // (empty if it was never revised).
  history?: Bid[];
}

export interface AuthUser {
  sub: string;
  email: string;
  companyId: string;
  role: string;
}

// The signed-in user's own account (GET /auth/me).
export interface Account {
  email: string;
  fullName: string;
  role: string;
  // Email when an RFQ is posted in one of the company's categories.
  rfqAlerts: boolean;
  company: { id: string; name: string; type: CompanyType };
}

export type StaffRole = 'VERIFIER' | 'PLATFORM_ADMIN';

// A portal staff account as the Staff page sees it (GET /staff).
export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  createdAt: string;
  disabledAt: string | null;
  // Still on a temporary password an admin issued.
  mustChangePassword: boolean;
}

// A new account or a reset: the temporary password is returned this once.
export interface IssuedPassword {
  user: StaffMember;
  temporaryPassword: string;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  totalValue: number;
  localValue: number;
  localPercentage: number;
}

export interface MonthlyTrendPoint {
  month: string;
  totalValue: number;
  localValue: number;
  localPercentage: number;
}

export interface RecentAward {
  bidId: string;
  supplierName: string;
  isLocallyOwned: boolean;
  categoryName: string;
  amount: number;
  currency: string;
  awardedAt: string;
}

export interface LocalContentSummary {
  totalAwardedValue: number;
  localAwardedValue: number;
  localContentPercentage: number;
  verifiedLocalSuppliersEngaged: number;
  openRfqCount: number;
  byCategory: CategoryBreakdown[];
  monthlyTrend: MonthlyTrendPoint[];
  recentAwards: RecentAward[];
}

// An email the outbox gave up on after 6 attempts (GET /emails/failed).
export interface FailedEmail {
  id: string;
  // What it's about: the outbox key's prefix, e.g. "rfq-alert", "bid-accepted".
  kind: string;
  to: string;
  subject: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sendBefore: string | null;
  // False for an RFQ alert whose bidding has closed: sending it is pointless.
  retryable: boolean;
}
