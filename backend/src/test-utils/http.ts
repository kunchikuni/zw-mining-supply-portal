import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'http';
import type { AddressInfo } from 'net';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOptionalAuthGuard } from '../auth/jwt-optional-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { createValidationPipe } from '../validation';

// HTTP-level test harness: the real controllers, decorators and validation
// pipe, with services replaced by mocks and the JWT guards replaced by ones
// that read the caller from an `x-test-user` header (no header = anonymous).
// The required guard throws 401 exactly like the real one.

const USER_HEADER = 'x-test-user';

function userFrom(ctx: ExecutionContext): JwtPayload | null {
  const req = ctx.switchToHttp().getRequest();
  const raw = req.headers[USER_HEADER];
  req.user = raw ? JSON.parse(raw) : null;
  return req.user;
}

const requiredGuard: CanActivate = {
  canActivate: (ctx) => {
    if (!userFrom(ctx)) throw new UnauthorizedException();
    return true;
  },
};

const optionalGuard: CanActivate = {
  canActivate: (ctx) => {
    userFrom(ctx);
    return true;
  },
};

export interface TestApp {
  app: INestApplication;
  request: (
    method: string,
    path: string,
    opts?: { body?: unknown; as?: JwtPayload },
  ) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
}

export async function createTestApp(
  controllers: any[],
  providers: { provide: any; useValue: unknown }[],
): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ controllers, providers })
    .overrideGuard(JwtAuthGuard)
    .useValue(requiredGuard)
    .overrideGuard(JwtOptionalAuthGuard)
    .useValue(optionalGuard)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;

  const request: TestApp['request'] = (method, path, opts = {}) =>
    new Promise((resolve, reject) => {
      const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
      const req = httpRequest(
        `http://127.0.0.1:${port}${path}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            ...(opts.as ? { [USER_HEADER]: JSON.stringify(opts.as) } : {}),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let body: any = raw;
            try {
              body = JSON.parse(raw);
            } catch {
              // not JSON — leave as text
            }
            resolve({ status: res.statusCode ?? 0, body });
          });
        },
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });

  return { app, request, close: () => app.close() };
}

// Guards attached to a handler via @UseGuards, for asserting a route is protected.
export function guardsOn(controller: any, handler: string): unknown[] {
  return Reflect.getMetadata('__guards__', controller.prototype[handler]) ?? [];
}
