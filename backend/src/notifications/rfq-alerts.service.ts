import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyType, Prisma, VerificationStatus } from '@prisma/client';
import { biddingClosesAt } from '../rfqs/bidding-window';
import { AlertRfq, buildRfqAlert } from './rfq-alert';
import { appUrlFrom } from './email-layout';

// Queues "new RFQ" emails. Called by RfqsService.create inside the transaction
// that creates the RFQ, so an RFQ that fails to save emails nobody, and an
// RFQ that saves always has its alerts queued. EmailOutboxService sends them.
@Injectable()
export class RfqAlertsService {
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    this.appUrl = appUrlFrom(config);
  }

  // Everyone who could bid on it and wants to hear about it: active users who
  // haven't turned alerts off, at a VERIFIED supplier that lists the RFQ's
  // category — the same eligibility BidsService enforces
  // (RfqsService.supplierIsEligible) — other than the posting mine itself.
  // Returns how many emails were queued.
  async enqueue(tx: Prisma.TransactionClient, rfq: AlertRfq & { mineCompanyId: string; categoryId: string }) {
    const recipients = await tx.user.findMany({
      where: {
        disabledAt: null,
        rfqAlerts: true,
        company: {
          id: { not: rfq.mineCompanyId },
          type: CompanyType.SUPPLIER,
          verificationStatus: VerificationStatus.VERIFIED,
          categories: { some: { categoryId: rfq.categoryId } },
        },
      },
      select: { id: true, email: true, fullName: true, company: { select: { name: true } } },
    });
    if (recipients.length === 0) return 0;

    // No point emailing about an RFQ whose bidding has closed by the time the
    // email would go out (e.g. after a long mail-server outage).
    const sendBefore = biddingClosesAt(rfq.deadline);
    const { count } = await tx.emailOutbox.createMany({
      data: recipients.map((r) => ({
        key: `rfq-alert:${rfq.id}:${r.id}`,
        to: r.email,
        sendBefore,
        ...buildRfqAlert(rfq, r, this.appUrl),
      })),
      skipDuplicates: true,
    });
    return count;
  }
}
