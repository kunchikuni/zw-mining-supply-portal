import { IsDateString, IsEnum, IsUrl, ValidateIf } from 'class-validator';
import { DocumentType } from '@prisma/client';
import { EXPIRY_REQUIRED } from '../document-expiry';

// The file itself is uploaded directly to object storage via a presigned URL
// (see documents.service#getUploadUrl); this DTO just registers the result.
export class CreateDocumentDto {
  @IsEnum(DocumentType)
  docType: DocumentType;

  @IsUrl()
  fileUrl: string;

  // Required for documents that renew (tax clearance, NSSA, PRAZ); optional
  // otherwise. DocumentsService refuses one on a company registration, which
  // doesn't expire, and a date that has already passed.
  @ValidateIf((o: CreateDocumentDto) => EXPIRY_REQUIRED.includes(o.docType) || o.expiresAt !== undefined)
  @IsDateString({}, { message: 'Add the expiry date shown on the document' })
  expiresAt?: string;
}
