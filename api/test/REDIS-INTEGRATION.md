# Integração HTTP Redis com MySQL e Memurai

A suíte usa o `AppModule`, os Guards, o TypeORM e o cliente ioredis reais. Ela é
separada dos e2e SQLite em `vitest.config.redis.e2e.ts` e somente pode apontar
para recursos de integração dedicados.

## Preparar os serviços isolados

1. Crie um schema MySQL vazio chamado `locamais_cache_integration` e um usuário
   de teste com permissões somente nesse schema. Não reutilize o schema de
   desenvolvimento. Como o projeto ainda não possui migrations, o TypeORM
   aplicará o schema das entities com `DATABASE_SYNCHRONIZE=true` somente nesse
   banco reservado.
2. Inicie uma instância Memurai separada da instância de desenvolvimento, em
   porta dedicada (exemplo: `6380`), sem compartilhar DB/porta com outros
   processos. A instância padrão em `6379` é recusada pelo setup.
3. No PowerShell, configure o processo da suíte (não grave esses valores no
   `.env` normal):

```powershell
$env:REDIS_INTEGRATION_TEST = '1'
$env:DATABASE_TYPE = 'mysql'
$env:DATABASE_HOST = '127.0.0.1'
$env:DATABASE_PORT = '3306'
$env:DATABASE_USERNAME = 'locamais_integration'
$env:DATABASE_PASSWORD = '<senha do usuário restrito>'
$env:DATABASE_NAME = 'locamais_cache_integration'
$env:DATABASE_SYNCHRONIZE = 'true'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '6380'
$env:REDIS_PASSWORD = ''
npm run test:e2e:redis
```

O setup falha antes de inicializar a aplicação se a flag de integração, o nome
exato do schema, `DATABASE_TYPE=mysql`, `DATABASE_SYNCHRONIZE=true` ou uma porta
Redis diferente da porta compartilhada padrão não forem satisfeitos. Não use
`FLUSHDB`/`FLUSHALL`. As chaves a remover devem ser exclusivamente aquelas
criadas pelos cenários e identificadas por seus IDs.

## Preparação e limpeza

O bootstrap deve criar dados identificáveis por uma marca exclusiva da
execução; o teardown deve excluir somente esses registros, na ordem inversa das
FKs, e remover somente as chaves Redis desses IDs. Não se deve truncar tabelas,
apagar o schema, nem limpar o Redis global. No ambiente MySQL descartável, a
remoção completa do schema de teste pode ser feita pelo operador depois da
execução, nunca como parte automática da suíte.

O e2e existente continua sendo executado com `npm run test:e2e` e SQLite em
memória. A integração real não é substituída por essa suíte.
