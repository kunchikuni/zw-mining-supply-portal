import { Module } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { RfqsController } from './rfqs.controller';

@Module({
  providers: [RfqsService],
  controllers: [RfqsController],
  exports: [RfqsService],
})
export class RfqsModule {}
