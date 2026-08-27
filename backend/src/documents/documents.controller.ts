import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  register(@CurrentUser() user: JwtPayload, @Body() dto: CreateDocumentDto) {
    // companyId comes from the token — a user can only add compliance
    // documents to their own company, never someone else's.
    return this.documentsService.register(user.companyId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findByCompany(@CurrentUser() user: JwtPayload, @Query('companyId') companyId?: string) {
    // Defaults to the caller's own company; a verifier/admin can still pass
    // an explicit companyId to inspect another company's documents.
    const isPrivileged = ['VERIFIER', 'PLATFORM_ADMIN'].includes(user.role);
    const targetCompanyId = isPrivileged && companyId ? companyId : user.companyId;
    return this.documentsService.findByCompany(targetCompanyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER', 'PLATFORM_ADMIN')
  @Get('review-queue')
  findPendingReview() {
    return this.documentsService.findPendingReview();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER', 'PLATFORM_ADMIN')
  @Patch(':id/review')
  review(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: DocumentStatus,
    @Body('reviewNote') reviewNote?: string,
  ) {
    // reviewedBy is the authenticated verifier, not a value the client sends.
    return this.documentsService.review(id, status, user.email, reviewNote);
  }
}
