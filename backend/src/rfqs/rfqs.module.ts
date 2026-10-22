import { Module } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { RfqsController } from './rfqs.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [RfqsService],
  controllers: [RfqsController],
  exports: [RfqsService],
})
export class RfqsModule {}
