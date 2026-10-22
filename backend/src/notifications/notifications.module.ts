import { Module } from '@nestjs/common';
import { Mailer, SmtpMailer } from './mailer';
import { EmailOutboxService } from './email-outbox.service';
import { RfqAlertsService } from './rfq-alerts.service';
import { BidUpdatesService } from './bid-updates.service';

@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }, EmailOutboxService, RfqAlertsService, BidUpdatesService],
  exports: [RfqAlertsService, BidUpdatesService],
})
export class NotificationsModule {}
