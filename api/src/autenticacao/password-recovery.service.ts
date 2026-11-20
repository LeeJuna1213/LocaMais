import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';

import { normalizeEmail } from '../common/utils/normalize.utility.js';
import { Usuario } from '../usuario/entities/usuario.entity.js';
import { UsuarioService } from '../usuario/usuario.service.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { PasswordRecoveryMailer } from './password-recovery.mailer.js';

const TOKEN_TTL_MS = 30 * 60_000;
const INVALID_TOKEN_MESSAGE = 'Link inválido, expirado ou já utilizado. Solicite um novo link de recuperação.';

@Injectable()
export class PasswordRecoveryService {
  static readonly GENERIC_MESSAGE = 'Se existir uma conta vinculada a esse e-mail, você receberá uma mensagem com as instruções para redefinir sua senha.';
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly users: UsuarioService,
    @InjectRepository(PasswordResetToken)
    private readonly tokens: Repository<PasswordResetToken>,
    private readonly dataSource: DataSource,
    private readonly mailer: PasswordRecoveryMailer,
  ) {}

  async request(email: string): Promise<{ message: string }> {
    if (!this.mailer.isConfigured()) {
      throw new ServiceUnavailableException('O envio de e-mails ainda não está configurado. Configure as variáveis MAIL_* e FRONTEND_BASE_URL no .env.');
    }

    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user?.active) return { message: PasswordRecoveryService.GENERIC_MESSAGE };

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PasswordResetToken);
      await repository.delete({ userId: user.id });
      await repository.save(repository.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
        usedAt: null,
      }));
    });

    try {
      await this.mailer.sendRecovery(user.email, rawToken);
    } catch {
      // Não revelar existência da conta nem deixar um link não entregue utilizável.
      await this.tokens.delete({ tokenHash });
      this.logger.error('Falha ao enviar e-mail de recuperação.');
    }

    return { message: PasswordRecoveryService.GENERIC_MESSAGE };
  }

  async reset(token: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const record = await this.tokens.findOneBy({ tokenHash });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    }

    const passwordHash = await this.users.hashPassword(newPassword);
    await this.dataSource.transaction(async (manager) => {
      // UPDATE condicional torna o consumo atômico: uma segunda requisição
      // concorrente afeta zero linhas e não consegue reutilizar o token.
      const consumed = await manager.update(
        PasswordResetToken,
        { id: record.id, usedAt: IsNull(), expiresAt: MoreThan(now) },
        { usedAt: now },
      );
      if (consumed.affected !== 1) throw new BadRequestException(INVALID_TOKEN_MESSAGE);

      const updated = await manager.update(Usuario, { id: record.userId }, { password: passwordHash });
      if (updated.affected !== 1) throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    });

    await this.users.passwordChanged(record.userId);
    return { message: 'Senha alterada com sucesso.' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
