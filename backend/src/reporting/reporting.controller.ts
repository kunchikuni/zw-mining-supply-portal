import { Controller, Get, Query } from '@nestjs/common';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // TODO: once auth guards land, restrict this to the mine's own company
  // (companyId should come from the JWT, not a trusted query param).
  @Get('local-content')
  localContent(@Query('mineCompanyId') mineCompanyId: string) {
    return this.reportingService.localContentSummary(mineCompanyId);
  }
}
