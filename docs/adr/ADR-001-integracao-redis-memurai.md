# ADR-001 — Integração com Redis (Memurai)

## Status

Aceito

## Contexto

A API LocaMais precisa de um mecanismo de cache para reduzir carga no MySQL e melhorar o tempo de resposta em consultas de leitura frequentes. O projeto já utiliza NestJS + TypeScript com TypeORM (MySQL). O Memurai foi instalado no Windows e respondeu corretamente a `memurai-cli ping` (`PONG`) na porta `6379`. A biblioteca `ioredis@^5.11.1` já estava instalada como dependência.

## Decisão

Adotar `ioredis` como cliente Redis, conectando ao Memurai em `127.0.0.1:6379`, encapsulado em um módulo NestJS `@Global()` chamado `RedisModule`, com um serviço `RedisService` que expõe métodos tipados (`get`, `set`, `del`, `exists`, `expire`, `getClient`).

## Alternativas Consideradas

| Alternativa | Prós | Contras | Por que não escolhida |
|-------------|------|---------|----------------------|
| `@nestjs/cache-manager` + `cache-manager-ioredis` | Integração pronta com NestJS, suporte a `@CacheInterceptor` | Adiciona dependências indiretas, menos controle fino sobre serialização e invalidação | Queremos controle explícito sobre chaves, TTL e invalidação por módulo, sem abstrações que escondam o comportamento do Redis |
| `ioredis` direto (sem wrapper NestJS) | Simples, direto | Requer criar módulo/provider manualmente, mais código boilerplate | O wrapper `RedisModule` + `RedisService` padroniza a injeção de dependência e o ciclo de vida da conexão |
| Não usar Redis | Sem nova dependência, sem complexidade | MySQL sofre carga desnecessária em leituras frequentes | O projeto já tem `ioredis` instalado e o Memurai está disponível; o benefício de cache justifica a integração |

## Detalhes da Implementação

### Arquivos envolvidos

- `src/config/redis.config.ts` — factory `buildRedisOptions(config)` que lê `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` via `ConfigService` e retorna `RedisOptions`.
- `src/redis/redis.constants.ts` — token `REDIS_CLIENT = 'REDIS_CLIENT'` (arquivo separado para evitar dependência circular em ESM).
- `src/redis/redis.module.ts` — `RedisModule` `@Global()` com `forRoot()` que cria uma única instância `new Redis(options)` via `useFactory`. Implementa `OnModuleDestroy` com `client.quit()`. Listeners de evento (`connect`, `ready`, `error`, `reconnecting`, `close`, `end`) para observabilidade.
- `src/redis/redis.service.ts` — `RedisService` com `get<T>`, `set`, `del`, `exists`, `expire`, `getClient`. Serialização JSON automática; `null` para chave inexistente.
- `src/redis/redis.decorator.ts` — decorator `@InjectRedis()` para injeção direta do cliente `ioredis`.
- `src/app.module.ts` — registro de `RedisModule.forRoot()` na lista de `imports`.
- `.env` — `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`, `REDIS_PASSWORD=`.
- `.env.example` — mesma seção adicionada.
- `scripts/redis-smoke-test.ts` — teste de integração contra Memurai real (PING, SET, GET, JSON, EXISTS, TTL, DEL).
- `src/redis/redis.service.spec.ts` — 12 testes unitários com mock.

### Por que não chamar `client.connect()` manualmente

O construtor `new Redis(options)` com `lazyConnect: false` (padrão) já inicia a conexão automaticamente. Chamar `await client.connect()` em seguida causaria o erro `"Redis is already connecting/connected"`. O factory apenas cria e retorna o cliente; o ioredis gerencia a conexão de forma assíncrona.

### Tratamento de erro

- Erros de conexão são logados via `Logger` do NestJS (evento `error`), sem expor senhas ou dados sensíveis.
- `onModuleDestroy` envolve `client.quit()` em `try/catch`; falhas são logadas e relançadas.
- O `RedisService` trata `null` para chaves inexistentes e tenta `JSON.parse` com fallback para valor bruto na desserialização.

## Consequências

### Positivas

- Redução de consultas ao MySQL para dados de leitura frequentes.
- Conexão única compartilhada (singleton) — evita múltiplas conexões desnecessárias.
- Encerramento limpo da conexão ao desligar a aplicação (`onModuleDestroy`).
- Observabilidade via listeners de evento do ioredis.
- Compatível com ESM e com as convenções existentes do projeto (imports `.js`, `ConfigService` global).

### Negativas / Riscos

- Risco de cache stale se a invalidação não for acionada corretamente após escritas. Mitigado com TTL curto e invalidação explícita no Service.
- O Redis é um cache, não fonte da verdade; o MySQL permanece como fonte autoritativa.
- Nenhum dado sensível (senha, token, dado financeiro) deve ser armazenado em cache.

## Observações

- O `.env` real não é versionado; apenas `.env.example` contém a seção Redis.
- Nenhuma entidade, migration ou módulo de autenticação foi alterada.
