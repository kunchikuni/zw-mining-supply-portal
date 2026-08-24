import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RatingsService } from './ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  create(
    @Body()
    body: {
      rfqId: string;
      ratedCompanyId: string;
      authorCompanyId: string;
      score: number;
      comment?: string;
    },
  ) {
    return this.ratingsService.create(body);
  }

  @Get('company/:id/average')
  averageForCompany(@Param('id') id: string) {
    return this.ratingsService.averageForCompany(id);
  }
}
