import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { Usuario } from '../usuario/entities/usuario.entity.js';

describe('PasswordRecoveryService', () => {
  const user = { id: 42, email: 'ana@example.test', active: true } as Usuario;
  const tokenRepository = {
    findOneBy: vi.fn(),
    delete: vi.fn(async () => ({ affected: 1 })),
  };
  const transactionalTokenRepository = {
    create: vi.fn((value) => value),
    save: vi.fn(async (value) => value),
    delete: vi.fn(async () => ({ affected: 1 })),
  };
  const manager = {
    getRepository: vi.fn(() => transactionalTokenRepository),
    update: vi.fn(async () => ({ affected: 1 })),
  };
  const dataSource = {
    transaction: vi.fn(async (callback) => callback(manager)),
  };
  const users = {
    findByEmail: vi.fn(),
    hashPassword: vi.fn(async (password: string) => `bcrypt:${password}`),
    passwordChanged: vi.fn(async () => undefined),
  };
  const mailer = {
    isConfigured: vi.fn(() => true),
    sendRecovery: vi.fn(async () => undefined),
  };
  let service: PasswordRecoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    users.findByEmail.mockResolvedValue(user);
    tokenRepository.findOneBy.mockResolvedValue(null);
    manager.update.mockResolvedValue({ affected: 1 });
    mailer.isConfigured.mockReturnValue(true);
    mailer.sendRecovery.mockResolvedValue(undefined);
    service = new PasswordRecoveryService(
      users as never,
      tokenRepository as never,
      dataSource as never,
      mailer as never,
    );
  });

  it('returns the same generic response for an unknown email without creating a token', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.request('missing@example.test')).resolves.toEqual({ message: PasswordRecoveryService.GENERIC_MESSAGE });
    expect(transactionalTokenRepository.save).not.toHaveBeenCalled();
    expect(mailer.sendRecovery).not.toHaveBeenCalled();
  });

  it('stores only a SHA-256 token hash, expires after 30 minutes and sends the raw token only by email', async () => {
    const before = Date.now();
    await service.request(' ANA@EXAMPLE.TEST ');
    const saved = transactionalTokenRepository.save.mock.calls[0]?.[0] as PasswordResetToken;
    const [, rawToken] = mailer.sendRecovery.mock.calls[0] as unknown as [string, string];
    expect(saved.userId).toBe(user.id);
    expect(saved.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(saved.tokenHash).not.toBe(rawToken);
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    expect(mailer.sendRecovery).toHaveBeenCalledWith(user.email, rawToken);
    await expect(service.request('ana@example.test')).resolves.toEqual({ message: PasswordRecoveryService.GENERIC_MESSAGE });
  });

  it('does not look up an email and reports missing SMTP configuration clearly', async () => {
    mailer.isConfigured.mockReturnValue(false);
    await expect(service.request('ana@example.test')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('invalidates a sent token if SMTP delivery fails without exposing account existence', async () => {
    mailer.sendRecovery.mockRejectedValue(new Error('SMTP rejected message'));
    await expect(service.request('ana@example.test')).resolves.toEqual({ message: PasswordRecoveryService.GENERIC_MESSAGE });
    const saved = transactionalTokenRepository.save.mock.calls[0]?.[0] as PasswordResetToken;
    expect(tokenRepository.delete).toHaveBeenCalledWith({ tokenHash: saved.tokenHash });
  });

  it('rejects invalid, expired and already used tokens', async () => {
    for (const record of [
      null,
      { id: 7, userId: user.id, tokenHash: 'hash', expiresAt: new Date(Date.now() - 1), usedAt: null },
      { id: 7, userId: user.id, tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
    ]) {
      tokenRepository.findOneBy.mockResolvedValueOnce(record);
      await expect(service.reset('some-token', 'NovaSenha1!')).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(users.hashPassword).not.toHaveBeenCalled();
  });

  it('updates password and consumes token in one transaction, then invalidates user cache', async () => {
    const rawToken = 'valid-recovery-token';
    tokenRepository.findOneBy.mockResolvedValue({
      id: 9,
      userId: user.id,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    await expect(service.reset(rawToken, 'NovaSenha1!')).resolves.toEqual({ message: 'Senha alterada com sucesso.' });
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(manager.update).toHaveBeenNthCalledWith(1, PasswordResetToken, expect.any(Object), { usedAt: expect.any(Date) });
    expect(manager.update).toHaveBeenNthCalledWith(2, Usuario, { id: user.id }, { password: 'bcrypt:NovaSenha1!' });
    expect(users.passwordChanged).toHaveBeenCalledWith(user.id);
  });

  it('rejects token reuse when the atomic consume operation loses a race', async () => {
    tokenRepository.findOneBy.mockResolvedValue({
      id: 9,
      userId: user.id,
      tokenHash: createHash('sha256').update('reused').digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    manager.update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.reset('reused', 'NovaSenha1!')).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.update).toHaveBeenCalledOnce();
    expect(users.passwordChanged).not.toHaveBeenCalled();
  });
});
