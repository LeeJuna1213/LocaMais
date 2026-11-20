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
- `POST /usuarios/me/foto` e `DELETE /usuarios/me/foto` exigem JWT e atuam apenas na conta do token.

## Foto de perfil do usuário

- `usuarios.foto` é `VARCHAR(500) NULL` e contém somente um caminho relativo como `/uploads/usuarios/<uuid>.webp`; o binário não é armazenado no MySQL nem no Redis.
- Os arquivos ficam em `api/uploads/usuarios/`, com nomes UUID e extensões de imagem permitidas. O upload é limitado a 5 MB e valida extensão, MIME type e assinatura do conteúdo.
- `GET /api/autenticacao/me` retorna `foto`. O cache `locamais:usuario:{id}` pode conter o caminho, nunca o arquivo; após a persistência da alteração/remocão são invalidados o cache do usuário e o cache do cliente relacionado, sem alterar TTLs.
- As fotos estáticas são servidas por `/uploads/...`, fora do prefixo `/api`. Na aplicação Ionic, a URL completa é resolvida pelo `ImageUrlService` a partir de `environment.apiUrl`.
- Para navegador local, `http://localhost:3000/api` resolve a `/uploads` na mesma origem. Em produção, `environment.apiUrl` deve apontar para a API pública. Em Capacitor num dispositivo físico, configure um hostname/IP da API alcançável pelo dispositivo (por exemplo, o IP LAN do computador); `localhost` no dispositivo é o próprio dispositivo.
- A migration `1795100000000-AddFotoPerfilToUsuarios` adiciona a coluna; execute `npm run migration:run` dentro de `api` com o `.env` configurado.

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
