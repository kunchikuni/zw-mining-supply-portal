import { IsDateString, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { DocumentType } from '@prisma/client';

// The file itself is uploaded directly to object storage via a presigned URL
// (see documents.service#getUploadUrl); this DTO just registers the result.
export class CreateDocumentDto {
  @IsString()
  companyId: string;

  @IsEnum(DocumentType)
  docType: DocumentType;

  @IsUrl()
  fileUrl: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
