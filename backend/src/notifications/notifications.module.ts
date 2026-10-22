import { Module } from '@nestjs/common';
import { Mailer, SmtpMailer } from './mailer';
import { EmailOutboxService } from './email-outbox.service';
import { RfqAlertsService } from './rfq-alerts.service';

@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }, EmailOutboxService, RfqAlertsService],
  exports: [RfqAlertsService],
})
export class NotificationsModule {}
