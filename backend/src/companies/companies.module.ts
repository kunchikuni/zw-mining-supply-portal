import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
