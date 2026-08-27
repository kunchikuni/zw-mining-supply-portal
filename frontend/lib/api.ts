import type {
  Bid,
  Category,
  Company,
  CompanyType,
  DocumentRecord,
  DocumentType,
  LocalContentSummary,
  Rfq,
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

export function registerUser(data: {
  companyId: string;
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
  return request<Company>('/companies', { method: 'POST', body: JSON.stringify(data) });
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

export function getCompany(id: string) {
  return request<Company>(`/companies/${id}`);
}

export function attachCategories(companyId: string, categoryIds: string[]) {
  return request(`/companies/${companyId}/categories`, {
    method: 'POST',
    body: JSON.stringify({ categoryIds }),
  });
}

// ---- Categories ----
export function getCategories() {
  return request<Category[]>('/categories');
}

// ---- Documents ----
export function registerDocument(data: {
  companyId: string;
  docType: DocumentType;
  fileUrl: string;
}) {
  return request<DocumentRecord>('/documents', { method: 'POST', body: JSON.stringify(data) });
}

// ---- RFQs ----
export function getOpenRfqs(filters: { categoryId?: string; province?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return request<Rfq[]>(`/rfqs${qs ? `?${qs}` : ''}`);
}

export function getRfq(id: string) {
  return request<Rfq>(`/rfqs/${id}`);
}

export function createRfq(data: {
  mineCompanyId: string;
  categoryId: string;
  title: string;
  description: string;
  quantity?: string;
  province?: string;
  deadline: string;
}) {
  return request<Rfq>('/rfqs', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Bids ----
export function createBid(data: {
  rfqId: string;
  supplierCompanyId: string;
  amount: number;
  currency?: string;
  leadTimeDays?: number;
  notes?: string;
}) {
  return request<Bid>('/bids', { method: 'POST', body: JSON.stringify(data) });
}

export function getBidsForRfq(rfqId: string) {
  return request<Bid[]>(`/bids?rfqId=${rfqId}`);
}

// ---- Reporting ----
export function getLocalContentSummary(mineCompanyId: string) {
  return request<LocalContentSummary>(`/reporting/local-content?mineCompanyId=${mineCompanyId}`);
}
