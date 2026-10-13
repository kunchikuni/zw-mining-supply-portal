import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Sign-in required, and the author is the caller's company from the token —
  // previously this was public and trusted an authorCompanyId in the body, so
  // anyone could rate anyone as anyone. See RatingsService.create for who may
  // rate what.
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRatingDto) {
    return this.ratingsService.create(user, dto);
  }

  // Public: an aggregate only, which reveals nothing about individual awards.
  @Get('company/:id/average')
  averageForCompany(@Param('id') id: string) {
    return this.ratingsService.averageForCompany(id);
  }
}
