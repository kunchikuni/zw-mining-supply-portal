import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { RfqsModule } from '../rfqs/rfqs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RfqsModule, NotificationsModule],
  providers: [BidsService],
  controllers: [BidsController],
})
export class BidsModule {}
