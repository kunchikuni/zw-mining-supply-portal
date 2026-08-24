import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { RfqStatus } from '@prisma/client';

@Controller('rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Post()
  create(@Body() dto: CreateRfqDto) {
    return this.rfqsService.create(dto);
  }

  @Get()
  findOpen(@Query('categoryId') categoryId?: string, @Query('province') province?: string) {
    return this.rfqsService.findOpen(categoryId, province);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rfqsService.findOne(id);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body('status') status: RfqStatus) {
    return this.rfqsService.setStatus(id, status);
  }
}
