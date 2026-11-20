import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const SUBJECT = 'LocaMais | Recuperação de senha';

@Injectable()
export class PasswordRecoveryMailer {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const required = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_FROM', 'FRONTEND_BASE_URL'];
    if (required.some((name) => !this.config.get<string>(name)?.trim())) return false;
    try {
      const base = new URL(this.config.getOrThrow<string>('FRONTEND_BASE_URL'));
      return base.protocol === 'http:' || base.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async sendRecovery(email: string, token: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('Configuração SMTP incompleta');

    const host = this.config.getOrThrow<string>('MAIL_HOST');
    const port = Number(this.config.getOrThrow<string>('MAIL_PORT'));
    const user = this.config.getOrThrow<string>('MAIL_USER');
    const pass = this.config.getOrThrow<string>('MAIL_PASSWORD');
    const from = this.config.getOrThrow<string>('MAIL_FROM');
    const frontendBaseUrl = this.config.getOrThrow<string>('FRONTEND_BASE_URL');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta SMTP inválida');

    const resetUrl = new URL('/redefinir-senha', frontendBaseUrl);
    resetUrl.searchParams.set('token', token);
    const link = resetUrl.toString();
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: SUBJECT,
      text: this.textBody(link),
      html: this.htmlBody(link),
    });
  }

  private textBody(link: string): string {
    return [
      'Olá!',
      '',
      'Recebemos uma solicitação para redefinir a senha da sua conta no LocaMais.',
      '',
      'Para criar uma nova senha, acesse o link abaixo:',
      link,
      '',
      'Esse link é pessoal, temporário e poderá ser utilizado apenas uma vez. Por segurança, ele expira em 30 minutos.',
      '',
      'Se você não solicitou a recuperação de senha, ignore esta mensagem. Sua senha atual continuará a mesma.',
      '',
      'Atenciosamente,',
      'Equipe LocaMais',
      'locamais.suporte@gmail.com',
    ].join('\n');
  }

  private htmlBody(link: string): string {
    const escapedLink = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fff8f1;font-family:Arial,sans-serif;color:#2d1b10"><main style="max-width:560px;margin:32px auto;padding:32px;background:#ffffff;border-radius:16px"><div style="font-size:22px;font-weight:700;color:#e86f12">LocaMais</div><h1 style="font-size:22px">Recuperação de senha</h1><p>Olá!</p><p>Recebemos uma solicitação para redefinir a senha da sua conta no LocaMais.</p><p>Para criar uma nova senha, clique no botão abaixo:</p><p style="margin:28px 0"><a href="${escapedLink}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#e86f12;color:#ffffff;text-decoration:none;font-weight:700">Redefinir minha senha</a></p><p>Esse link é pessoal, temporário e poderá ser utilizado apenas uma vez. Por segurança, ele expira em 30 minutos.</p><p>Se você não solicitou a recuperação de senha, ignore esta mensagem. Sua senha atual continuará a mesma.</p><p style="margin-top:28px">Atenciosamente,<br>Equipe LocaMais<br><a href="mailto:locamais.suporte@gmail.com">locamais.suporte@gmail.com</a></p></main></body></html>`;
  }
}
