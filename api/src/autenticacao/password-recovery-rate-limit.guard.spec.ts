import { ExecutionContext, HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordRecoveryRateLimitGuard } from './password-recovery-rate-limit.guard.js';

describe('PasswordRecoveryRateLimitGuard', () => {
  afterEach(() => vi.useRealTimers());

  function context(ip = '127.0.0.1', path = '/api/autenticacao/recuperar-senha'): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ ip, path, socket: { remoteAddress: ip } }) }),
    } as unknown as ExecutionContext;
  }

  it('allows five requests per IP and returns HTTP 429 on the sixth', () => {
    const guard = new PasswordRecoveryRateLimitGuard();
    for (let attempt = 0; attempt < 5; attempt += 1) expect(guard.canActivate(context())).toBe(true);
    try {
      guard.canActivate(context());
      throw new Error('expected rate limit rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(guard.canActivate(context('192.0.2.1'))).toBe(true);
  });

  it('resets the request bucket after fifteen minutes', () => {
    vi.useFakeTimers();
    const guard = new PasswordRecoveryRateLimitGuard();
    for (let attempt = 0; attempt < 5; attempt += 1) guard.canActivate(context());
    vi.advanceTimersByTime(15 * 60_000);
    expect(guard.canActivate(context())).toBe(true);
  });
});
