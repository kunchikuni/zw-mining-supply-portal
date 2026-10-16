import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { CategoriesModule } from './categories/categories.module';
import { DocumentsModule } from './documents/documents.module';
import { RfqsModule } from './rfqs/rfqs.module';
import { BidsModule } from './bids/bids.module';
import { RatingsModule } from './ratings/ratings.module';
import { ReportingModule } from './reporting/reporting.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CompaniesModule,
    CategoriesModule,
    DocumentsModule,
    RfqsModule,
    BidsModule,
    RatingsModule,
    ReportingModule,
    StaffModule,
  ],
})
export class AppModule {}
