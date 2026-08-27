import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtOptionalAuthGuard extends AuthGuard('jwt') {
  // Default passport behaviour throws on a missing/invalid token. Here we
  // just fall back to req.user = null so public routes like GET /companies/:id
  // can still render for anonymous visitors, while authenticated visitors
  // get the extra fields (e.g. document links) their token entitles them to.
  handleRequest(_err: unknown, user: unknown) {
    return user || null;
  }
}
