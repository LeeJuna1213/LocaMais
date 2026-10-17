import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../common/utils/normalize.utility.js';
import { User } from '../user/entities/user.entity.js';
import { UserType } from '../user/enums/user.enum.js';
import { UserService } from '../user/user.service.js';

/**
 * Cria o primeiro admin no boot a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
 *
 * Sem isso o sistema nao tem como sair do zero, ja que admins so podem ser
 * criados por admins. A operacao e idempotente: se ja existir qualquer admin,
 * nada acontece e as variaveis de seed sao ignoradas.
 */
@Injectable()
export class SeedAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedAdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly usersService: UserService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('ADMIN_EMAIL');
    const password = this.configService.get<string>('ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.log(
        'ADMIN_EMAIL/ADMIN_PASSWORD ausentes — seed de admin ignorado',
      );
      return;
    }

    const existingAdmins = await this.usersRepository.count({
      where: { type: UserType.ADMIN },
    });

    if (existingAdmins > 0) {
      this.logger.log(
        `ja existe ${existingAdmins} admin(s) — seed ignorado`,
      );
      return;
    }

    const name =
      this.configService.get<string>('ADMIN_NAME') ?? 'Administrador';

    const admin = await this.usersService.create(
      { id: 0, email, name, type: UserType.ADMIN },
      { name, email: normalizeEmail(email), password, type: UserType.ADMIN },
    );

    this.logger.warn(
      `admin inicial criado: ${admin.email} (${admin.id}) — troque a senha`,
    );
  }
}