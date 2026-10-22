import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FailedEmailsService } from './failed-emails.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// Platform admins only: emails the outbox gave up on, and sending one again.
@Controller('emails')
export class EmailsController {
  constructor(private readonly failedEmails: FailedEmailsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Get('failed')
  listFailed() {
    return this.failedEmails.list();
  }

  // For the admin nav's badge, so a mail server outage gets noticed.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Get('failed/count')
  countFailed() {
    return this.failedEmails.count();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.failedEmails.retry(id);
  }
}
