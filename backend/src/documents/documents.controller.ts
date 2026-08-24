import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentStatus } from '@prisma/client';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  register(@Body() dto: CreateDocumentDto) {
    return this.documentsService.register(dto);
  }

  @Get()
  findByCompany(@Query('companyId') companyId: string) {
    return this.documentsService.findByCompany(companyId);
  }

  // TODO: guard to VERIFIER / PLATFORM_ADMIN role
  @Get('review-queue')
  findPendingReview() {
    return this.documentsService.findPendingReview();
  }

  // TODO: guard to VERIFIER / PLATFORM_ADMIN role
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body('status') status: DocumentStatus,
    @Body('reviewedBy') reviewedBy: string,
    @Body('reviewNote') reviewNote?: string,
  ) {
    return this.documentsService.review(id, status, reviewedBy, reviewNote);
  }
}
