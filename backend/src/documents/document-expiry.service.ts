import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DocumentStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lapsedBefore, lapsedDocumentTypes } from './document-expiry';

const HOUR_MS = 60 * 60 * 1000;

// Time until just after the next top of the hour. Every expiry date ends at a
// Harare midnight (22:00 UTC), which is on the hour, so a run then catches each
// lapse within seconds.
export function msUntilNextHour(now: Date): number {
  return HOUR_MS - (now.getTime() % HOUR_MS) + 1000;
}

// Marks documents EXPIRED once their expiry date has passed, and takes
// verification away from companies that relied on them. Runs at startup (for
// anything that lapsed while the server was down) and at the top of every
// hour, which also retries soon after a failed run. Every write is
// conditional, so a second run — or one on another instance — changes nothing.
@Injectable()
export class DocumentExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onApplicationBootstrap() {
    const tick = () => {
      this.runSafely();
      this.schedule(tick);
    };
    this.runSafely();
    this.schedule(tick);
  }

  onApplicationShutdown() {
    clearTimeout(this.timer);
  }

  private schedule(tick: () => void) {
    this.timer = setTimeout(tick, msUntilNextHour(new Date()));
    // Never the reason the process stays alive.
    this.timer.unref();
  }

  private runSafely() {
    this.run().catch((err: Error) => this.logger.error(`Document expiry run failed: ${err.message}`));
  }

  async run(now: Date = new Date()) {
    // Approved documents lapse, and so do pending ones: a verifier can't
    // approve an expired document, so it leaves the review queue.
    const live = [DocumentStatus.APPROVED, DocumentStatus.PENDING];
    const lapsed = await this.prisma.document.findMany({
      where: { status: { in: live }, expiresAt: { lt: lapsedBefore(now) } },
      select: { id: true, companyId: true, status: true },
    });
    if (lapsed.length === 0) return { expired: 0, companiesUnverified: [] as string[] };

    await this.prisma.document.updateMany({
      where: { id: { in: lapsed.map((d) => d.id) }, status: { in: live } },
      data: { status: DocumentStatus.EXPIRED },
    });

    const affected = new Set(
      lapsed.filter((d) => d.status === DocumentStatus.APPROVED).map((d) => d.companyId),
    );
    const companiesUnverified: string[] = [];
    for (const companyId of Array.from(affected)) {
      if (await this.recheckCompany(companyId, now)) companiesUnverified.push(companyId);
    }

    this.logger.log(
      `Expired ${lapsed.length} document(s); ${companiesUnverified.length} company(ies) lost verification`,
    );
    return { expired: lapsed.length, companiesUnverified };
  }

  // A VERIFIED company without a current approval for every document type it
  // had approved loses verification: back to PENDING if a replacement is
  // already waiting for review, or UNVERIFIED until it uploads one (which then
  // moves it to PENDING — see DocumentsService.register). A renewal approved
  // before the old document lapsed keeps it verified.
  private async recheckCompany(companyId: string, now: Date): Promise<boolean> {
    const docs = await this.prisma.document.findMany({
      where: { companyId },
      select: { docType: true, status: true, expiresAt: true, reviewedBy: true },
    });
    if (lapsedDocumentTypes(docs, now).length === 0) return false;

    const renewalWaiting = docs.some((d) => d.status === DocumentStatus.PENDING);
    const { count } = await this.prisma.company.updateMany({
      where: { id: companyId, verificationStatus: VerificationStatus.VERIFIED },
      data: {
        verificationStatus: renewalWaiting ? VerificationStatus.PENDING : VerificationStatus.UNVERIFIED,
      },
    });
    return count === 1;
  }
}
