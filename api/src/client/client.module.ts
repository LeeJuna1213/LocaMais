import { Module } from '@nestjs/common';

import { UserModule } from '../user/user.module.js';

import { ClientController } from './client.controller.js';
import { ClientService } from './client.service.js';

/**
 * Módulo de cliente.
 *
 * Responsabilidade: expor as rotas e as regras que só fazem sentido no
 * contexto de cliente (dados PF/PJ + endereço), mantendo o módulo `user`
 * como dono do cadastro geral e da autenticação.
 *
 * Por que importar o UserModule em vez de repetir `TypeOrmModule.forFeature`?
 * O UserModule registra os Repositories de User, Client e Address e os
 * reexporta via `exports: [TypeOrmModule]`. Assim:
 * - não existem duas cópias da mesma entidade/registro;
 * - o ClientModule enxerga Repository<User> e Repository<Client>;
 * - não há dependência circular, pois o UserModule não importa o ClientModule.
 */
@Module({
  imports: [UserModule],
  controllers: [ClientController],
  providers: [ClientService],
  // Outros módulos (por exemplo, futuras reservas) podem reaproveitar as
  // regras de cliente sem recriar o Service.
  exports: [ClientService],
})
export class ClientModule {}
