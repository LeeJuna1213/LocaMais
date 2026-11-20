import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordRecoveryMailer } from './password-recovery.mailer.js';

const transportMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({ createTransport: transportMocks.createTransport }));

describe('PasswordRecoveryMailer', () => {
  afterEach(() => vi.clearAllMocks());

  it('requires SMTP credentials and a frontend base URL', () => {
    const config = { get: () => undefined, getOrThrow: () => { throw new Error('missing'); } } as unknown as ConfigService;
    expect(new PasswordRecoveryMailer(config).isConfigured()).toBe(false);
  });

  it('sends branded text and HTML email from configured sender with token link', async () => {
    const values: Record<string, string> = {
      MAIL_HOST: 'smtp.gmail.com', MAIL_PORT: '587', MAIL_SECURE: 'false',
      MAIL_USER: 'locamais.suporte@gmail.com', MAIL_PASSWORD: 'test-app-password',
      MAIL_FROM: 'locamais.suporte@gmail.com', FRONTEND_BASE_URL: 'https://locamais.example.test',
    };
    const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
    transportMocks.sendMail.mockResolvedValue({ messageId: 'mail-id' });
    transportMocks.createTransport.mockReturnValue({ sendMail: transportMocks.sendMail });

    await new PasswordRecoveryMailer(config).sendRecovery('ana@example.test', 'token-value');

    expect(transportMocks.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'locamais.suporte@gmail.com', pass: 'test-app-password' },
    });
    expect(transportMocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'locamais.suporte@gmail.com',
      to: 'ana@example.test',
      subject: 'LocaMais | Recuperação de senha',
      text: expect.stringContaining('https://locamais.example.test/redefinir-senha?token=token-value'),
      html: expect.stringContaining('Redefinir minha senha'),
    }));
  });
});
