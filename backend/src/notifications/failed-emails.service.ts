import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const LIST_LIMIT = 100;

// Emails the outbox gave up on (FAILED after 6 attempts), for platform admins:
// see them, and send one again once the cause is fixed (a mail server outage,
// a bad SMTP password, a mistyped address corrected on the account).
@Injectable()
export class FailedEmailsService {
  constructor(private prisma: PrismaService) {}

  // Newest first. `kind` is what the email is about (the key's prefix, e.g.
  // "rfq-alert", "bid-accepted", "doc-expiry-7"); `retryable` is false for an
  // RFQ alert whose bidding has closed, which the outbox would only skip.
  async list(now: Date = new Date()) {
    const rows = await this.prisma.emailOutbox.findMany({
      where: { status: EmailStatus.FAILED },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: { id: true, key: true, to: true, subject: true, attempts: true, lastError: true, createdAt: true, sendBefore: true },
    });
    return rows.map(({ key, ...row }) => ({
      ...row,
      kind: key.split(':')[0],
      retryable: !row.sendBefore || row.sendBefore > now,
    }));
  }

  async count() {
    return { count: await this.prisma.emailOutbox.count({ where: { status: EmailStatus.FAILED } }) };
  }

  // Back to PENDING with a fresh set of attempts, due now: the outbox picks it
  // up within 15 seconds. The last error stays until it's sent.
  async retry(id: string, now: Date = new Date()) {
    const email = await this.prisma.emailOutbox.findUnique({ where: { id }, select: { status: true, sendBefore: true } });
    if (!email) throw new NotFoundException('Email not found');
    if (email.status !== EmailStatus.FAILED) {
      throw new ConflictException('Only an email that failed can be sent again');
    }
    if (email.sendBefore && email.sendBefore <= now) {
      throw new ConflictException('This email is no longer worth sending: bidding on its RFQ has closed');
    }
    const { count } = await this.prisma.emailOutbox.updateMany({
      where: { id, status: EmailStatus.FAILED },
      data: { status: EmailStatus.PENDING, attempts: 0, nextAttemptAt: now },
    });
    if (count !== 1) throw new ConflictException('This email was just changed — reload and try again');
    return { id, status: EmailStatus.PENDING };
  }
}
