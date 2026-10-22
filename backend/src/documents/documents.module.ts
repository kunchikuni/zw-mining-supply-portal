import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentExpiryService } from './document-expiry.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [DocumentsService, DocumentExpiryService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
