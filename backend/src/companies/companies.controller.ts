import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { SearchCompaniesDto } from './dto/search-companies.dto';
import { VerificationStatus } from '@prisma/client';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  search(@Query() filters: SearchCompaniesDto) {
    return this.companiesService.search(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post(':id/categories')
  attachCategories(@Param('id') id: string, @Body('categoryIds') categoryIds: string[]) {
    return this.companiesService.attachCategories(id, categoryIds);
  }

  // TODO: restrict to VERIFIER / PLATFORM_ADMIN role once auth guards are wired up
  @Patch(':id/verification-status')
  setVerificationStatus(
    @Param('id') id: string,
    @Body('status') status: VerificationStatus,
  ) {
    return this.companiesService.setVerificationStatus(id, status);
  }
}
