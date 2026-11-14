# Change Log — LocaMais API

Todas as mudanças notáveis no backend da API LocaMais são documentadas neste arquivo.

O formato segue as convenções de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto adota versionamento semântico.

---

## [Não lançado] — Integração Redis / Memurai

### Adicionado

- Módulo Redis (`src/redis/redis.module.ts`) — `@Global()`, com `forRoot()` que cria uma única instância do cliente `ioredis` e a compartilha com toda a aplicação via provider `REDIS_CLIENT`.
- Serviço de cache (`src/redis/redis.service.ts`) — métodos `get<T>`, `set`, `del`, `exists`, `expire` e `getClient()`, com serialização JSON automática e tratamento seguro de valores inexistentes.
- Token de injeção dedicado (`src/redis/redis.constants.ts`) — `REDIS_CLIENT = 'REDIS_CLIENT'`, declarado em arquivo separado para evitar dependência circular em ESM.
- Decorator de injeção (`src/redis/redis.decorator.ts`) — `@InjectRedis()` para injetar diretamente o cliente `ioredis` quando necessário.
- Factory de configuração (`src/config/redis.config.ts`) — `buildRedisOptions(config)` lê `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` via `ConfigService` e retorna `RedisOptions` compatíveis com `ioredis`.
- Registro do `RedisModule.forRoot()` em `src/app.module.ts` na lista de módulos globais.
- Seção Redis em `.env.example` com `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD`.
- Teste de integração com Memurai real (`scripts/redis-smoke-test.ts`) — valida PING, SET, GET, JSON, EXISTS, TTL e DEL contra o servidor local.
- Testes unitários do `RedisService` (`src/redis/redis.service.spec.ts`) — 12 testes aprovados com mock do cliente `ioredis`.

### Modificado

- `src/redis/redis.module.ts` — adicionados listeners de evento do ioredis (`connect`, `ready`, `error`, `reconnecting`, `close`, `end`) com `Logger` do NestJS para observabilidade; `onModuleDestroy` agora trata falhas de `quit()` com `try/catch`, loga o erro e relança a exceção.
- Remoção da chamada manual `await client.connect()` no factory provider (o construtor `new Redis(options)` já inicia a conexão automaticamente; chamar `connect()` novamente causava o erro `"Redis is already connecting/connected"`).

### Documentação

- Criada pasta `docs/` com:
  - `README.md` — índice e instruções para novos ADRs.
  - `arquitetura-atual.md` — visão geral da arquitetura do backend (módulos, endpoints, services, entities, DTOs, cache, banco de dados, testes).
  - `adr/ADR-001-integracao-redis-memurai.md` — decisão de arquitetura sobre a integração com Redis/Memurai.
  - `adr/ADR-002-estrategia-cache-redis.md` — estratégia proposta de cache por módulo (endpoints recomendados, TTLs, invalidação, riscos, ordem de implementação).
- Este arquivo (`docs/change-log.md`).

### Testes

- Compilação TypeScript (`tsc -p tsconfig.build.json --noEmit`): 0 erros.
- Testes unitários Vitest: 59/59 aprovados (9 arquivos), incluindo os 12 do `redis.service.spec.ts`.
- Teste de integração com Memurai real: 7/7 verificações aprovadas.

### Não alterado

- Nenhuma entidade, migration ou módulo de autenticação foi modificado.
- O módulo de carros não recebeu cache ainda.
- Nenhuma segunda instância Redis foi criada.
- Configurações do MySQL permanecem inalteradas.
- O arquivo `.env` real não foi versionado nem modificado.

---

## [0.0.1] — Versão inicial

- Estrutura base do backend NestJS com TypeScript.
- Módulos de domínio: autenticacao, usuario, cliente, endereco, carro, reserva, locacao, pagamento, revisao, vistoria.
- Banco de dados MySQL via TypeORM (com suporte a SQLite para dev/testes).
- Autenticação JWT com `@nestjs/jwt` e `passport-jwt`.
- Guards globais `JwtAuthGuard` e `RolesGuard`.
- Documentação Swagger em `/docs`.
- Testes unitários com Vitest.

---

### Tipos de mudança

- `Adicionado` — novas funcionalidades.
- `Modificado` — mudanças em funcionalidades existentes.
- `Documentação` — mudanças apenas em arquivos de documentação.
- `Testes` — mudanças ou adições apenas em testes.
- `Não alterado` — itens explicitamente preservados.
- `Removido` — funcionalidades removidas (não aplicado nesta versão).
- `Corrigido` — correções de bugs (não aplicado nesta versão).
