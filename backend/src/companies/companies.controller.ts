import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { SearchCompaniesDto } from './dto/search-companies.dto';
import { SetCategoriesDto } from './dto/set-categories.dto';
import { SetVerificationStatusDto } from './dto/set-verification-status.dto';
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
  // before its first user account exists. The response carries the one-time
  // `inviteCode` that /auth/register requires to become that company's admin.
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  search(@Query() filters: SearchCompaniesDto) {
    return this.companiesService.search(filters);
  }

  // Companies waiting on a verifier's decision. Declared before `:id` so
  // "verification-queue" isn't captured as a company id.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER', 'PLATFORM_ADMIN')
  @Get('verification-queue')
  verificationQueue() {
    return this.companiesService.verificationQueue();
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
    @Body() dto: SetCategoriesDto,
  ) {
    return this.companiesService.attachCategories(id, dto.categoryIds, user);
  }

  // Replace semantics — the listing becomes exactly `categoryIds`. This is
  // the endpoint behind the category editor on the company profile.
  @UseGuards(JwtAuthGuard)
  @Put(':id/categories')
  setCategories(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetCategoriesDto,
  ) {
    return this.companiesService.setCategories(id, dto.categoryIds, user);
  }

  // Admin-only (enforced in the service, which also allows PLATFORM_ADMIN):
  // returns a one-time code a teammate redeems at POST /auth/register.
  @UseGuards(JwtAuthGuard)
  @Post(':id/invites')
  createInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.companiesService.createInvite(id, user, dto.email);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER', 'PLATFORM_ADMIN')
  @Patch(':id/verification-status')
  setVerificationStatus(@Param('id') id: string, @Body() dto: SetVerificationStatusDto) {
    return this.companiesService.setVerificationStatus(id, dto.status);
  }
}
