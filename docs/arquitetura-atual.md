# Arquitetura Atual — Backend LocaMais

## Visão Geral

O backend da API LocaMais é uma aplicação NestJS com TypeScript, rodando em ESM (`type: "module"`, `moduleResolution: nodenext`). O banco de dados principal é MySQL (via TypeORM), com suporte a SQLite para desenvolvimento/testes. A integração com Redis (Memurai) foi adicionada para cache.

## Camadas

```
src/
├── main.ts                     # Bootstrap da aplicação NestJS
├── app.module.ts               # Modulo raiz: registra ConfigModule, TypeOrmModule, RedisModule, ObserveModule e modulos de feature
├── app.setup.ts                # Configuracao comum (ValidationPipe, CORS, global prefix 'api')
├── app.controller.ts / app.service.ts
├── config/                     # Factories de configuracao (database.config.ts, redis.config.ts)
├── database/                   # DataSource, seed-admin, migrations
├── common/                     # Decorators, guards, interfaces, utils, validators
├── redis/                      # Modulo Redis (RedisModule, RedisService, redis.constants, redis.decorator)
├── autenticacao/               # Login, registro, JWT strategy
├── usuario/                    # Contas de acesso (ADMIN, FUNCIONARIO, CLIENTE)
├── cliente/                    # Cadastro PF/PJ (1:1 com Usuario + Endereco)
├── endereco/                   # Endereco do cliente
├── carro/                      # Frota de veiculos
├── reserva/                    # Reservas (PENDENTE, CONFIRMADA, CANCELADA, CONCLUIDA)
├── locacao/                    # Locacoes efetivas (AGUARDANDO_RETIRADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA)
├── pagamento/                  # Pagamentos vinculados a locacoes
├── revisao/                    # Revisoes periodicas de veiculos
└── vistoria/                   # Vistorias de retirada e devolucao
```

## Tecnologias

- **NestJS** v12 — framework principal
- **TypeScript** — linguagem
- **ESM / nodenext** — sistema de módulos (imports locais com extensão `.js`)
- **TypeORM** — ORM para MySQL/SQLite
- **ioredis** v5 — cliente Redis (Memurai)
- **@nestjs/config** — variáveis de ambiente (`ConfigService`, `isGlobal: true`)
- **bcrypt** — hash de senhas
- **@nestjs/jwt** + **passport-jwt** — autenticação JWT
- **class-validator** + **class-transformer** — validação de DTOs
- **Swagger** — documentação da API em `/docs`
- **Vitest** — testes unitários (`*.spec.ts`)

## Fluxo de Requisição

```
Cliente HTTP
    ↓
main.ts (NestFactory.create)
    ↓
app.setup.ts (global prefix 'api', ValidationPipe, CORS)
    ↓
AppModule (guards globais: JwtAuthGuard, RolesGuard)
    ↓
Controller de feature (ex: CarroController)
    ↓
Service de feature (ex: CarroService)
    ↓
TypeORM Repository -> MySQL
```

## Autenticação e Autorização

- Guard global `JwtAuthGuard` nega acesso a todas as rotas exceto aquelas marcadas com `@Public()`.
- `RolesGuard` controla acesso por papel (`ADMIN`, `FUNCIONARIO`, `CLIENTE`).
- `JwtStrategy.validate()` recarrega o usuário do banco a cada request (não confia apenas no token).
- `POST /autenticacao/login` e `POST /autenticacao/register` são públicas (`@Public()`).
- `GET /autenticacao/me` retorna dados do usuário autenticado.

## Cache (Redis / Memurai)

- `RedisModule` é `@Global()` e registrado em `AppModule` via `RedisModule.forRoot()`.
- Uma única instância do cliente `ioredis` é criada e compartilhada por toda a aplicação.
- `RedisService` oferece `get`, `set`, `del`, `exists`, `expire`, `getClient`.
- `onModuleDestroy` encerra a conexão com `QUIT`.
- Listeners de evento (`connect`, `ready`, `error`, `reconnecting`, `close`, `end`) fornecem observabilidade via `Logger` do NestJS.
- Nenhum dado sensível (senha, token, dado financeiro) é armazenado em cache.

## Banco de Dados

- MySQL em produção, SQLite em desenvolvimento/testes.
- Configuração via `DATABASE_TYPE` no `.env`.
- `ConfigModule` é global (`isGlobal: true`), então `ConfigService` está disponível em toda a aplicação.
- TypeORM `synchronize` controlado por `DATABASE_SYNCHRONIZE` (false em produção, usar migrations).

## Testes

- Vitest roda `**/*.spec.ts`.
- 59 testes unitários aprovados (9 arquivos).
- Teste de integração com Memurai real (`scripts/redis-smoke-test.ts`): 7/7 verificações aprovadas.
