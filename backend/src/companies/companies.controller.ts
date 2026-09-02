import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { SearchCompaniesDto } from './dto/search-companies.dto';
import { VerificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOptionalAuthGuard } from '../auth/jwt-optional-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // Deliberately unguarded — this is how onboarding creates a company
  // before its first user account exists (see /auth/register flow).
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  search(@Query() filters: SearchCompaniesDto) {
    return this.companiesService.search(filters);
  }

  // Public (directory must be browsable by anonymous visitors), but uses an
  // optional guard so an authenticated owner/verifier gets the fuller view
  // (document links) that CompaniesService.findOne gates on requester.
  @UseGuards(JwtOptionalAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload | null) {
    return this.companiesService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/categories')
  attachCategories(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('categoryIds') categoryIds: string[],
  ) {
    return this.companiesService.attachCategories(id, categoryIds, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER', 'PLATFORM_ADMIN')
  @Patch(':id/verification-status')
  setVerificationStatus(
    @Param('id') id: string,
    @Body('status') status: VerificationStatus,
  ) {
    return this.companiesService.setVerificationStatus(id, status);
  }
}
