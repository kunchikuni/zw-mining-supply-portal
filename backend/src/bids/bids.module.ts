import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { RfqsModule } from '../rfqs/rfqs.module';

@Module({
  imports: [RfqsModule],
  providers: [BidsService],
  controllers: [BidsController],
})
export class BidsModule {}
