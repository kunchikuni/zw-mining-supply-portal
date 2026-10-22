import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Mailer } from './mailer';

const POLL_MS = 15_000;
const BATCH_SIZE = 20;
// While one sender is working on an email, nobody else picks it up. If the
// process dies mid-send, the email becomes due again after this.
const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 6;
// Wait after the 1st…5th failed attempt; the 6th failure gives up.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];

// Delivers the EmailOutbox: every 15 seconds, up to 20 due emails, oldest
// first. Each email is claimed with a conditional update before sending, so
// two instances never send the same one; delivery is at-least-once (a crash
// between sending and recording it means one resend after the lease).
@Injectable()
export class EmailOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailOutboxService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private prisma: PrismaService,
    private mailer: Mailer,
  ) {}

  onApplicationBootstrap() {
    if (!this.mailer.configured) {
      this.logger.warn('SMTP_HOST is not set: emails are queued in the outbox but not sent');
      return;
    }
    this.timer = setInterval(() => void this.runSafely(), POLL_MS);
    this.timer.unref();
    void this.runSafely();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async runSafely() {
    if (this.busy) return; // a slow run isn't overlapped by the next tick
    this.busy = true;
    try {
      await this.deliverDue();
    } catch (err) {
      this.logger.error(`Email outbox run failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  async deliverDue(now: Date = new Date()) {
    const due = await this.prisma.emailOutbox.findMany({
      where: { status: EmailStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
    });
    const result = { sent: 0, retrying: 0, failed: 0, skipped: 0 };

    for (const email of due) {
      if (email.sendBefore && email.sendBefore <= now) {
        await this.prisma.emailOutbox.updateMany({
          where: { id: email.id, status: EmailStatus.PENDING },
          data: { status: EmailStatus.SKIPPED },
        });
        result.skipped++;
        continue;
      }

      const claim = await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, status: EmailStatus.PENDING, attempts: email.attempts },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claim.count !== 1) continue; // another sender got it first

      const attempt = email.attempts + 1;
      try {
        await this.mailer.send({ to: email.to, subject: email.subject, text: email.text, html: email.html });
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: { status: EmailStatus.SENT, sentAt: new Date(), lastError: null },
        });
        result.sent++;
      } catch (err) {
        const giveUp = attempt >= MAX_ATTEMPTS;
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            status: giveUp ? EmailStatus.FAILED : EmailStatus.PENDING,
            lastError: String((err as Error)?.message ?? err).slice(0, 500),
            ...(giveUp ? {} : { nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[attempt - 1]) }),
          },
        });
        if (giveUp) result.failed++;
        else result.retrying++;
      }
    }

    if (due.length > 0) {
      this.logger.log(
        `Outbox: ${result.sent} sent, ${result.retrying} to retry, ${result.failed} failed, ${result.skipped} skipped`,
      );
    }
    return result;
  }
}
