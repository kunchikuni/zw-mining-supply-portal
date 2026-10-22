import { Module } from '@nestjs/common';
import { Mailer, SmtpMailer } from './mailer';
import { EmailOutboxService } from './email-outbox.service';
import { RfqAlertsService } from './rfq-alerts.service';
import { BidUpdatesService } from './bid-updates.service';
import { CompanyUpdatesService } from './company-updates.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { EmailsController } from './emails.controller';
import { FailedEmailsService } from './failed-emails.service';

@Module({
  controllers: [UnsubscribeController, EmailsController],
  providers: [
    FailedEmailsService,
    { provide: Mailer, useClass: SmtpMailer },
    EmailOutboxService,
    RfqAlertsService,
    BidUpdatesService,
    CompanyUpdatesService,
  ],
  exports: [RfqAlertsService, BidUpdatesService, CompanyUpdatesService],
})
export class NotificationsModule {}
