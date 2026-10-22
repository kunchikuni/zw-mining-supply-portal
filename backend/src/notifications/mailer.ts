import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// What EmailOutboxService sends through. A class rather than an interface so
// it can be the injection token; tests provide their own.
export abstract class Mailer {
  // False when no mail server is configured: emails then wait in the outbox.
  abstract readonly configured: boolean;
  abstract send(email: OutgoingEmail): Promise<void>;
}

// SMTP, configured from the environment. Locally that's Mailpit
// (SMTP_HOST=127.0.0.1, SMTP_PORT=1025), which catches everything in a web
// inbox; in production, any SMTP provider.
@Injectable()
export class SmtpMailer extends Mailer {
  readonly configured: boolean;
  private readonly from: string;
  private readonly transport?: ReturnType<typeof createTransport>;

  constructor(config: ConfigService) {
    super();
    const host = config.get<string>('SMTP_HOST');
    this.configured = Boolean(host);
    this.from = config.get<string>('MAIL_FROM') || 'ZW Supplier Portal <no-reply@localhost>';
    if (host) {
      const user = config.get<string>('SMTP_USER');
      this.transport = createTransport({
        host,
        port: Number(config.get<string>('SMTP_PORT') ?? 587),
        secure: config.get<string>('SMTP_SECURE') === 'true',
        auth: user ? { user, pass: config.get<string>('SMTP_PASS') ?? '' } : undefined,
      });
    }
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (!this.transport) throw new Error('No mail server configured (SMTP_HOST is not set)');
    await this.transport.sendMail({ from: this.from, ...email });
  }
}
