import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { SetBidStatusDto } from './dto/set-bid-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBidDto) {
    // supplierCompanyId comes from the verified token — a logged-in user
    // can only ever bid as their own company.
    return this.bidsService.create(user.companyId, dto);
  }

  @Get()
  findByRfq(@Query('rfqId') rfqId: string) {
    return this.bidsService.findByRfq(rfqId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetBidStatusDto,
  ) {
    return this.bidsService.setStatus(id, user, dto.status);
  }
}
