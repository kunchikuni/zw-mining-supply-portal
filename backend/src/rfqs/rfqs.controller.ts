import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { RfqStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRfqDto) {
    // mineCompanyId comes from the verified token, never from the request
    // body — otherwise any logged-in user could post an RFQ as any company.
    return this.rfqsService.create(user.companyId, dto);
  }

  @Get()
  findOpen(@Query('categoryId') categoryId?: string, @Query('province') province?: string) {
    return this.rfqsService.findOpen(categoryId, province);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rfqsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body('status') status: RfqStatus) {
    // TODO: once RFQ ownership is checked, restrict this to the posting mine.
    return this.rfqsService.setStatus(id, status);
  }
}
