import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { SetRfqStatusDto } from './dto/set-rfq-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOptionalAuthGuard } from '../auth/jwt-optional-auth.guard';
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

  // Public, but with the optional guard so the posting mine still sees its
  // own RFQs after their deadline (see RfqsService.findOpen).
  @UseGuards(JwtOptionalAuthGuard)
  @Get()
  findOpen(
    @CurrentUser() user: JwtPayload | null,
    @Query('categoryId') categoryId?: string,
    @Query('province') province?: string,
  ) {
    return this.rfqsService.findOpen(categoryId, province, user?.companyId);
  }

  // Every RFQ the caller's company has posted, in any status. Declared before
  // `:id` so "mine" isn't captured as an RFQ id.
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.rfqsService.findMine(user.companyId);
  }

  // Public, but with the optional guard so the server knows who's asking:
  // bids are sealed, so the posting mine gets every bid, a bidder gets its
  // own, and everyone else gets only the count (`_count.bids`).
  @UseGuards(JwtOptionalAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload | null) {
    return this.rfqsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetRfqStatusDto,
  ) {
    return this.rfqsService.setStatus(id, user, dto.status);
  }
}
