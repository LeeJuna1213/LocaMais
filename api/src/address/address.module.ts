import { Module } from '@nestjs/common';

import { UserModule } from '../user/user.module.js';

import { AddressController } from './address.controller.js';
import { AddressService } from './address.service.js';

/**
 * Módulo de endereço.
 *
 * Responsabilidade: expor as rotas e as regras de manutenção do endereço do
 * cliente. O cadastro inicial do endereço continua acontecendo dentro da
 * transação de `UserService.createClient`, garantindo que um cliente nunca
 * fique sem endereço.
 *
 * O UserModule é importado para reaproveitar os Repositories de Address e
 * Client já registrados (`exports: [TypeOrmModule]`), sem duplicar entidades
 * nem criar uma dependência circular com o ClientModule.
 */
@Module({
  imports: [UserModule],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
