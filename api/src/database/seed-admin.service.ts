import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../common/utils/normalize.utility.js';
import { Usuario } from '../usuario/entities/usuario.entity.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { UsuarioService } from '../usuario/usuario.service.js';

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
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    private readonly usuariosService: UsuarioService,
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

    const existingAdmins = await this.usuariosRepository.count({
      where: { type: TipoUsuario.ADMIN },
    });

    if (existingAdmins > 0) {
      this.logger.log(
        `ja existe ${existingAdmins} admin(s) — seed ignorado`,
      );
      return;
    }

    const name =
      this.configService.get<string>('ADMIN_NAME') ?? 'Administrador';

    const admin = await this.usuariosService.create(
      { id: 0, email, name, type: TipoUsuario.ADMIN },
      { name, email: normalizeEmail(email), password, type: TipoUsuario.ADMIN },
    );

    this.logger.warn(
      `admin inicial criado: ${admin.email} (${admin.id}) — troque a senha`,
    );
  }
}