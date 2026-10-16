import type {
  Bid,
  BidStatus,
  Category,
  Company,
  CompanyCategory,
  CompanyType,
  CreatedCompany,
  DocumentRecord,
  DocumentType,
  LocalContentSummary,
  Rfq,
  RfqRating,
  RfqStatus,
  VerificationQueueCompany,
  VerificationStatus,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Auth ----
export function login(email: string, password: string) {
  return request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// `inviteCode` is what ties the new user to a company: the one returned by
// createCompany for a company's first admin, or one issued by createInvite.
export function registerUser(data: {
  inviteCode: string;
  email: string;
  password: string;
  fullName: string;
}) {
  return request<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---- Companies ----
export function createCompany(data: {
  name: string;
  type: CompanyType;
  province?: string;
  town?: string;
  registrationNumber?: string;
  isLocallyOwned?: boolean;
  description?: string;
}) {
  return request<CreatedCompany>('/companies', { method: 'POST', body: JSON.stringify(data) });
}

export function searchCompanies(filters: {
  type?: CompanyType;
  categoryId?: string;
  province?: string;
  verificationStatus?: VerificationStatus;
  q?: string;
}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return request<Company[]>(`/companies${qs ? `?${qs}` : ''}`);
}

export function getCompany(id: string, token?: string | null) {
  return request<Company>(`/companies/${id}`, { token });
}

export function attachCategories(companyId: string, categoryIds: string[], token: string) {
  return request(`/companies/${companyId}/categories`, {
    method: 'POST',
    body: JSON.stringify({ categoryIds }),
    token,
  });
}

// Replaces the company's whole category listing with exactly `categoryIds`.
export function setCompanyCategories(companyId: string, categoryIds: string[], token: string) {
  return request<CompanyCategory[]>(`/companies/${companyId}/categories`, {
    method: 'PUT',
    body: JSON.stringify({ categoryIds }),
    token,
  });
}

// Company admins only. The returned code is shown once and never retrievable
// again — the backend keeps only its hash.
export function createInvite(companyId: string, token: string, email?: string) {
  return request<{ inviteCode: string; expiresAt: string }>(`/companies/${companyId}/invites`, {
    method: 'POST',
    body: JSON.stringify(email ? { email } : {}),
    token,
  });
}

// ---- Categories ----
export function getCategories() {
  return request<Category[]>('/categories');
}

// ---- Documents ----
// `expiresAt` (YYYY-MM-DD) is required for tax clearance, NSSA and PRAZ.
export function registerDocument(
  token: string,
  data: { docType: DocumentType; fileUrl: string; expiresAt?: string },
) {
  return request<DocumentRecord>('/documents', {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

// ---- Verification (VERIFIER / PLATFORM_ADMIN only) ----
// Pending documents, oldest first, each with its company.
export function getDocumentReviewQueue(token: string) {
  return request<DocumentRecord[]>('/documents/review-queue', { token });
}

// A document is reviewed once. Rejecting requires a note; approving takes the
// expiry date as the verifier read it off the document.
export function reviewDocument(
  id: string,
  decision: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string; expiresAt?: string },
  token: string,
) {
  return request<DocumentRecord>(`/documents/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(decision),
    token,
  });
}

// Companies in PENDING (they've submitted documents), with a document summary.
export function getVerificationQueue(token: string) {
  return request<VerificationQueueCompany[]>('/companies/verification-queue', { token });
}

// VERIFIED needs a current approved document and nothing lapsed without an
// approved renewal; the server enforces it.
export function setVerificationStatus(companyId: string, status: VerificationStatus, token: string) {
  return request<Company>(`/companies/${companyId}/verification-status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  });
}

// ---- RFQs ----
// The token is optional: anonymous visitors get the public board, and a
// signed-in mine additionally gets its own RFQs back after their deadline.
export function getOpenRfqs(
  filters: { categoryId?: string; province?: string } = {},
  token?: string | null,
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return request<Rfq[]>(`/rfqs${qs ? `?${qs}` : ''}`, { token });
}

// Bids are sealed, so the token matters here: the posting mine gets every
// bid, a bidder gets its own, and anyone else (or no token) gets only
// `_count.bids`.
export function getRfq(id: string, token?: string | null) {
  return request<Rfq>(`/rfqs/${id}`, { token });
}

// Everything the signed-in company has posted, in any status.
export function getMyRfqs(token: string) {
  return request<Rfq[]>('/rfqs/mine', { token });
}

// Only the posting mine can do this, and only OPEN -> CLOSED | CANCELLED or
// CLOSED -> CANCELLED. An RFQ becomes AWARDED by accepting a bid, not here.
export function setRfqStatus(id: string, status: RfqStatus, token: string) {
  return request<Rfq>(`/rfqs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  });
}

export function createRfq(
  token: string,
  data: {
    categoryId: string;
    title: string;
    description: string;
    quantity?: string;
    province?: string;
    deadline: string;
  },
) {
  return request<Rfq>('/rfqs', { method: 'POST', body: JSON.stringify(data), token });
}

// ---- Bids ----
// If the caller already has a live (submitted or shortlisted) bid on this RFQ,
// this one replaces it as a revision; the old version stays in its history.
export function createBid(
  token: string,
  data: {
    rfqId: string;
    amount: number;
    currency?: string;
    leadTimeDays?: number;
    notes?: string;
  },
) {
  return request<Bid>('/bids', { method: 'POST', body: JSON.stringify(data), token });
}

// Requires sign-in; returns only the bids the caller may see on that RFQ.
export function getBidsForRfq(rfqId: string, token: string) {
  return request<Bid[]>(`/bids?rfqId=${encodeURIComponent(rfqId)}`, { token });
}

// Every bid the signed-in company has placed, newest first, each with the
// RFQ it was placed on.
export function getMyBids(token: string) {
  return request<Bid[]>('/bids/mine', { token });
}

// Accepting a bid also marks its RFQ AWARDED, in the same transaction.
export function setBidStatus(id: string, status: BidStatus, token: string) {
  return request<Bid>(`/bids/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  });
}

// ---- Ratings ----
// The posting mine rates a supplier whose bid it accepted on an awarded RFQ,
// once per supplier. The author is the caller's company, from the token.
export function createRating(
  token: string,
  data: { rfqId: string; ratedCompanyId: string; score: number; comment?: string },
) {
  return request<RfqRating>('/ratings', { method: 'POST', body: JSON.stringify(data), token });
}

// ---- Reporting ----
export function getLocalContentSummary(token: string) {
  return request<LocalContentSummary>('/reporting/local-content', { token });
}
