export type CompanyType = 'MINE' | 'SUPPLIER';

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

export type BidStatus = 'SUBMITTED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

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
}

export interface DocumentRecord {
  id: string;
  companyId: string;
  docType: DocumentType;
  fileUrl: string;
  status: DocumentStatus;
  uploadedAt: string;
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
  createdAt: string;
  bids?: Bid[];
}

export interface Bid {
  id: string;
  rfqId: string;
  supplierCompanyId: string;
  supplier?: Company;
  amount: string;
  currency: string;
  leadTimeDays?: number | null;
  notes?: string | null;
  status: BidStatus;
  submittedAt: string;
}

export interface AuthUser {
  sub: string;
  email: string;
  companyId: string;
  role: string;
}
