'use client';

import { FormEvent, useState } from 'react';
import { registerDocument, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DocumentType } from '@/lib/types';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  COMPANY_REGISTRATION: 'Company registration (CR6 / CR14)',
  TAX_CLEARANCE: 'Tax clearance (ZIMRA ITF263)',
  NSSA_COMPLIANCE: 'NSSA compliance certificate',
  PRAZ_REGISTRATION: 'PRAZ registration',
  SAFETY_CERTIFICATE: 'Safety certificate',
  QUALITY_CERTIFICATE: 'Quality certificate',
  OTHER: 'Other',
};

export function DocumentUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { token } = useAuth();
  const [docType, setDocType] = useState<DocumentType>('COMPANY_REGISTRATION');
  const [fileUrl, setFileUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Sign in to add a document.');
      return;
    }
    if (!fileUrl.trim()) {
      setError('Add a link to the document before submitting.');
      return;
    }

    setLoading(true);
    try {
      await registerDocument(token, { docType, fileUrl: fileUrl.trim() });
      setFileUrl('');
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register the document.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-4">
      <h3 className="card-title">Add a compliance document</h3>
      <p className="text-xs text-gray-500">
        A verifier reviews every document before it counts toward your verification status.
      </p>
      {error && <ErrorBanner message={error} />}
      <div>
        <label htmlFor="docType" className="label">
          Document type
        </label>
        <select
          id="docType"
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType)}
          className="input"
        >
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fileUrl" className="label">
          Link to document
        </label>
        <input
          id="fileUrl"
          type="url"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          placeholder="https://..."
          className="input"
          required
        />
        <p className="hint">
          Direct file upload is coming in Phase 2 — for now, link a Google Drive/Dropbox file set to
          &quot;anyone with the link can view&quot;.
        </p>
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Add document
      </Button>
    </form>
  );
}
