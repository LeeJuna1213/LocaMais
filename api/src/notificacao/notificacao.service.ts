import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { RedisService } from '../redis/redis.service.js';
import { Notificacao } from './entities/notificacao.entity.js';

@Injectable()
export class NotificacaoService {
  private readonly logger = new Logger(NotificacaoService.name);
  constructor(@InjectRepository(Notificacao) private readonly repository: Repository<Notificacao>, private readonly redis: RedisService, private readonly config: ConfigService) {}

  async create(input: Pick<Notificacao, 'usuario_id' | 'reserva_id' | 'tipo' | 'titulo' | 'descricao'>): Promise<Notificacao> {
    const item = await this.repository.save(this.repository.create({ ...input, lida_em: null }));
    await this.invalidate(input.usuario_id);
    return item;
  }

  async list(userId: number): Promise<Array<Pick<Notificacao, 'id' | 'tipo' | 'titulo' | 'descricao' | 'reserva_id' | 'created_at' | 'lida_em'> & { reserva: { id: string; codigo: string | null } | null }>> {
    const rows = await this.repository.find({ where: { usuario_id: userId }, relations: { reserva: true }, order: { created_at: 'DESC' } });
    return rows.map(({ id, tipo, titulo, descricao, reserva_id, created_at, lida_em, reserva }) => ({
      id, tipo, titulo, descricao, reserva_id, created_at, lida_em,
      reserva: reserva ? { id: reserva.id, codigo: reserva.codigo } : null,
    }));
  }

  async unreadCount(userId: number): Promise<number> {
    const key = `locamais:notificacoes:nao-lidas:${userId}`;
    try {
      const cached = await this.redis.get<number>(key);
      if (cached !== null && cached !== undefined) return Number(cached);
    } catch (error) { this.logger.warn(`Falha ao ler contador de notificações: ${String(error)}`); }
    const count = await this.repository.count({ where: { usuario_id: userId, lida_em: IsNull() } });
    try { await this.redis.set(key, count, 60); } catch (error) { this.logger.warn(`Falha ao armazenar contador de notificações: ${String(error)}`); }
    return count;
  }

  async markRead(userId: number, id: string): Promise<Notificacao> {
    const item = await this.repository.findOne({ where: { id, usuario_id: userId } });
    if (!item) throw new NotFoundException('Notificação não encontrada.');
    if (!item.lida_em) {
      item.lida_em = new Date();
      await this.repository.save(item);
      await this.invalidate(userId);
    }
    return item;
  }

  async sendCancellationEmail(to: string, name: string, details: Record<string, string>, refunded: boolean): Promise<void> {
    const required = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASSWORD', 'MAIL_FROM'];
    if (required.some((key) => !this.config.get<string>(key)?.trim())) {
      this.logger.warn('E-mail de cancelamento não enviado: SMTP não configurado.');
      return;
    }
    const fields = Object.entries(details).map(([label, value]) => `<tr><td style="padding:8px;color:#775d49">${this.escape(label)}</td><td style="padding:8px"><strong>${this.escape(value)}</strong></td></tr>`).join('');
    const transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port: Number(this.config.getOrThrow<string>('MAIL_PORT')),
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      auth: { user: this.config.getOrThrow<string>('MAIL_USER'), pass: this.config.getOrThrow<string>('MAIL_PASSWORD') },
    });
    await transporter.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'), to,
      subject: 'Sua reserva no LocaMais foi cancelada',
      html: `<div style="font-family:Arial,sans-serif;color:#2b1a0d;max-width:640px;margin:auto"><h1 style="color:#aa510c">LocaMais</h1><h2>Sua reserva foi cancelada</h2><p>Olá, ${this.escape(name)}. A reserva foi cancelada pela equipe LocaMais.</p><table>${fields}</table>${refunded ? '<p style="padding:12px;background:#fff7ee">O valor pago foi estornado dentro da simulação acadêmica. Nenhuma transação financeira real foi realizada.</p>' : ''}<p>Em caso de dúvidas, entre em contato com nossa equipe.</p></div>`,
    });
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  }

  private async invalidate(userId: number): Promise<void> {
    try { await this.redis.del(`locamais:notificacoes:nao-lidas:${userId}`); }
    catch (error) { this.logger.warn(`Falha ao invalidar contador de notificações: ${String(error)}`); }
  }
}
