import { ValidationPipe } from '@nestjs/common';

// The one global validation pipe. Defined here (not inline in main.ts) so the
// HTTP-level tests run requests through exactly the configuration production
// uses — whitelisting is what strips fields like an injected authorCompanyId.
export function createValidationPipe() {
  return new ValidationPipe({ whitelist: true, transform: true });
}
