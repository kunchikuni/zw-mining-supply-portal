import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { FindBidsQueryDto } from './dto/find-bids-query.dto';
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

  // The caller's own bids across every RFQ. The company comes from the token,
  // never a query param, so one supplier can't list another's bids this way.
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.bidsService.findMine(user.companyId);
  }

  // Sealed: sign-in required, and only the bids the caller may see come back
  // (all of them for the posting mine, otherwise the caller's own). `rfqId`
  // is required — without it this used to list every bid on the platform.
  @UseGuards(JwtAuthGuard)
  @Get()
  findByRfq(@CurrentUser() user: JwtPayload, @Query() query: FindBidsQueryDto) {
    return this.bidsService.findByRfq(query.rfqId, user);
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
