import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { BidStatus } from '@prisma/client';

@Controller('bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post()
  create(@Body() dto: CreateBidDto) {
    return this.bidsService.create(dto);
  }

  @Get()
  findByRfq(@Query('rfqId') rfqId: string) {
    return this.bidsService.findByRfq(rfqId);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body('status') status: BidStatus) {
    return this.bidsService.setStatus(id, status);
  }
}
