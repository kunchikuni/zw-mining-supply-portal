import { BadRequestException, Controller, Get, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { verifyUnsubscribeToken } from './unsubscribe';

// Public: the token in the link is the authorisation (see unsubscribe.ts).
@Controller('email/unsubscribe')
export class UnsubscribeController {
  private readonly secret: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('JWT_SECRET') as string;
  }

  // What the link is for, for the page to show before asking. Changes
  // nothing: link scanners and previews fetch URLs from emails.
  @Get()
  async lookup(@Query('token') token?: string) {
    const user = await this.userFor(token);
    return { email: user.email, rfqAlerts: user.rfqAlerts };
  }

  // Turns the user's new-RFQ alerts off. Mailbox providers' one-click
  // button POSTs here (RFC 8058, body "List-Unsubscribe=One-Click", which is
  // ignored); so does the page's confirm button. Repeating it is harmless.
  @Post()
  @HttpCode(200)
  async unsubscribe(@Query('token') token?: string) {
    const user = await this.userFor(token);
    await this.prisma.user.update({ where: { id: user.id }, data: { rfqAlerts: false } });
    return { email: user.email, rfqAlerts: false };
  }

  private async userFor(token?: string) {
    const userId = verifyUnsubscribeToken(this.secret, token);
    if (!userId) throw new BadRequestException("This unsubscribe link isn't valid");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, rfqAlerts: true },
    });
    if (!user) throw new NotFoundException('This account no longer exists');
    return user;
  }
}
