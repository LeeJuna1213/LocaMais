
/*
 * MODULE (MÓDULO) NO NESTJS
 *
 * Um Module é responsável por organizar e agrupar
 * os componentes relacionados a uma funcionalidade
 * da aplicação.
 *
 * No nosso projeto, o UserModule reúne os recursos
 * responsáveis pelo gerenciamento de usuários.
 *
 * Ele informa ao NestJS:
 * - Quais outros módulos ou recursos serão importados;
 * - Quais Controllers pertencem a este módulo;
 * - Quais Services estarão disponíveis;
 * - Quais Services poderão ser utilizados por outros módulos.
 *
 * Os módulos ajudam a dividir a aplicação em partes
 * organizadas e com responsabilidades específicas.
 */

// Importa o decorator @Module, utilizado para
// identificar uma classe como módulo do NestJS.
import { Module } from '@nestjs/common';

// Importa o TypeOrmModule, responsável pela integração
// do TypeORM com o sistema de módulos do NestJS.
//
// Ele permite disponibilizar os Repositories das
// entidades para os Services.
import { TypeOrmModule } from '@nestjs/typeorm';

// Importa a entidade Address.
// Representa o mapeamento dos endereços dos clientes.
import { Address } from '../address/entities/address.entity.js';

// Importa a entidade Client.
// Representa os dados específicos dos clientes.
// O arquivo foi movido para o módulo client, mas continua registrado
// no UserModule para disponibilizar o Repository via TypeOrmModule.forFeature().
import { Client } from '../client/entities/client.entity.js';

// Importa a entidade User.
// Representa os usuários cadastrados no sistema.
import { User } from './entities/user.entity.js';

// Importa o Controller responsável por receber
// as requisições HTTP relacionadas aos usuários.
//
// Exemplo: GET /users, POST /users, DELETE /users/:id.
import { UserController } from './user.controller.js';

// Importa o Service responsável por executar
// as regras de negócio relacionadas aos usuários.
//
// Ele utiliza os Repositories para consultar,
// cadastrar, atualizar e excluir registros.
import { UserService } from './user.service.js';

/*
 * DECORATOR @Module()
 *
 * Identifica a classe UserModule como um módulo NestJS.
 *
 * Dentro dele, configuramos os componentes que
 * pertencem ao módulo e suas dependências.
 */
@Module({

  /*
   * IMPORTS
   *
   * Define os módulos que serão importados
   * e disponibilizados dentro do UserModule.
   *
   * TypeOrmModule.forFeature() registra os
   * Repositories das entidades informadas.
   *
   * Neste caso:
   * - Repository<User>
   * - Repository<Client>
   * - Repository<Address>
   *
   * Assim, os Services deste módulo podem receber
   * esses Repositories por injeção de dependência,
   * utilizando @InjectRepository().
   *
   * IMPORTANTE:
   * O forFeature() não cria as tabelas sozinho.
   * Ele disponibiliza os Repositories no módulo.
   *
   * A criação das tabelas depende da configuração
   * do TypeORM, como migrations ou synchronize.
   */
  imports: [
    TypeOrmModule.forFeature([User, Client, Address]),
  ],

  /*
   * CONTROLLERS
   *
   * Define quais Controllers pertencem ao módulo.
   *
   * O UserController recebe as requisições HTTP
   * relacionadas aos usuários e encaminha as
   * operações para o UserService.
   *
   * Exemplos:
   * GET /users
   * POST /users
   * PATCH /users/:id
   *
   * O Controller não deve concentrar as regras
   * de negócio ou realizar diretamente as consultas.
   */
  controllers: [
    UserController,
  ],

  /*
   * PROVIDERS
   *
   * Registra os provedores que podem ser injetados
   * como dependências dentro deste módulo.
   *
   * O UserService é um provider.
   *
   * Ao registrá-lo aqui, o NestJS pode criar
   * e gerenciar sua instância automaticamente.
   *
   * Dessa forma, o UserController consegue
   * receber o UserService pelo constructor:
   *
   * constructor(
   *   private readonly userService: UserService
   * ) {}
   *
   * Esse mecanismo é chamado de
   * INJEÇÃO DE DEPENDÊNCIA.
   */
  providers: [
    UserService,
  ],

  /*
   * EXPORTS
   *
   * Define quais providers ou recursos registrados
   * neste módulo poderão ser utilizados por
   * outros módulos que importarem o UserModule.
   *
   * Aqui estamos exportando duas coisas:
   *
   * 1) UserService
   *    Por exemplo, se o AuthModule importar o UserModule,
   *    ele poderá injetar o UserService para consultar um
   *    usuário durante o login.
   *
   * 2) TypeOrmModule
   *    O `forFeature` acima é privado do módulo que o declara.
   *    Para que ClientModule e AddressModule possam injetar os
   *    Repositories de User, Client e Address sem registrar as
   *    mesmas entidades outra vez, reexportamos o TypeOrmModule.
   *
   * OBSERVAÇÃO:
   * Exportar o UserService, sozinho, NÃO disponibiliza os
   * Repositories. Por isso o TypeOrmModule também aparece aqui.
   */
  exports: [
    UserService,
    TypeOrmModule,
  ],
})

// Classe que representa o módulo de usuários.
//
// Ela não precisa possuir métodos próprios,
// pois sua configuração está no decorator @Module().
export class UserModule {}
