import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('local-content')
  localContent(@CurrentUser() user: JwtPayload) {
    // mineCompanyId is always the caller's own company — there is no query
    // param anymore, so there's nothing to spoof to see another company's
    // procurement numbers.
    return this.reportingService.localContentSummary(user.companyId);
  }
}
