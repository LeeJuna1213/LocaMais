# ADR-002 — Estratégia de Cache Redis por Módulo

## Status

Implementado para infraestrutura, os sete caches e as invalidações cruzadas descritas no ADR-003. A remoção best-effort de chaves é seguida de reconstrução sob demanda nos GETs; falhas de consultas de dependentes ou Redis são registradas e podem manter entradas até o TTL. `DATABASE_SYNCHRONIZE` é desabilitado por padrão e somente habilitado pelo valor explícito `true`; testes de integração dedicados podem ativá-lo apenas no banco isolado. A suíte HTTP MySQL/Memurai tem cenários implementados; seu estado de aprovação depende da execução registrada, não da existência dos testes.

## 1. Contexto

A API NestJS LocaMais usa Redis para reduzir consultas repetidas ao MySQL em leituras selecionadas. MySQL permanece a fonte oficial dos dados; Redis contém apenas cópias temporárias de respostas. A decisão de consistência detalhada e a matriz de dependências entre respostas cacheadas estão no [ADR-003 — Política de Consistência e Invalidação dos Caches Redis](./ADR-003-politica-consistencia-invalidation-cache-redis.md).

## 2. Infraestrutura Redis

O projeto usa **ioredis** (`ioredis@^5.11.1`) como cliente. No ambiente de desenvolvimento Windows, o servidor Redis-compatível usado é o **Memurai**. A conexão de runtime é configurável por ambiente; o código não restringe o servidor a Memurai.

Valores Redis que não possam ser desserializados como JSON são tratados como cache MISS; a chave é removida em best-effort e a falha dessa remoção não bloqueia o fallback à fonte persistente. Strings JSON válidas continuam suportadas.

| Arquivo | Responsabilidade implementada |
|---|---|
| `api/src/config/redis.config.ts` | `buildRedisOptions` lê `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` via `ConfigService`. Defaults: `127.0.0.1`, `6379` e sem senha. Configura conexão automática (`lazyConnect: false`), ready check, timeout de 10s, no máximo 3 retries por request e estratégia de reconexão com espera crescente limitada a 3s. |
| `api/src/redis/redis.constants.ts` | Define `REDIS_CLIENT`, token de injeção que identifica o provider ioredis e evita dependência circular em ESM. |
| `api/src/redis/redis.module.ts` | `RedisModule.forRoot()` cria uma instância `new Redis(options)` via provider `REDIS_CLIENT`. O módulo é `@Global()` para permitir que Services usem `RedisService` sem importar o módulo em cada módulo de domínio. `AppModule` registra `RedisModule.forRoot()` uma vez. Registra listeners de conexão/erro/reconexão e encerra o cliente com `quit()` em `OnModuleDestroy`. |
| `api/src/redis/redis.service.ts` | Wrapper tipado para operações de chave-valor e serialização. Os métodos não absorvem falhas Redis; os Services de cache tratam falhas de leitura, gravação e invalidação conforme o caminho de negócio. |
| `api/src/redis/cache-invalidation.module.ts` | Módulo global que disponibiliza o colaborador de invalidação DB-aware; separado do `RedisModule` para manter a infraestrutura Redis reutilizável sem dependência de TypeORM. |
| `api/src/redis/cache-invalidation.service.ts` | Consulta IDs dependentes por FKs/relacionamentos no MySQL e remove as chaves Redis correspondentes, sem atualizar objetos cacheados. Falhas SQL/Redis são registradas e não revertem a escrita de negócio. |
| `api/src/redis/redis.decorator.ts` | Exporta `@InjectRedis()` como atalho de `@Inject(REDIS_CLIENT)` para injetar o cliente ioredis diretamente. Os sete Services cacheados utilizam `RedisService`; o decorator não é o mecanismo usado por eles. |
| `api/src/app.module.ts` | Importa `RedisModule.forRoot()` e a configuração global `ConfigModule`. |

### 2.1 Operações expostas por `RedisService`

- `get<T>(key)`: chama Redis `GET`; retorna `null` quando a chave não existe ou contém JSON inválido, removendo a chave inválida em best-effort.
- `set(key, value, ttl?)`: valores passam por `JSON.stringify` (incluindo `toJSON()` de entidades). TTL positivo é aplicado no comando `SET ... EX ttl`, em segundos. Sem TTL positivo, grava sem expiração automática.
- `del(key)`: remove a chave com Redis `DEL`.
- `exists(key)`: chama `EXISTS` e converte o resultado para boolean.
- `expire(key, ttl)`: chama Redis `EXPIRE`, em segundos.
- `getClient()`: disponibiliza o cliente ioredis para operações adicionais; o wrapper recomenda evitar `KEYS` em produção.

O módulo registra eventos `connect`, `ready`, `error`, `reconnecting`, `close` e `end`. As falhas são observáveis nos logs e não há log intencional de senha Redis. `RedisService` propaga exceções: são os Services de cache que capturam falhas e mantêm o MySQL como caminho principal. A configuração ioredis prevê retries/reconexão, mas não torna Redis uma dependência de consistência forte. Na invalidação best-effort, uma falha pode deixar valor antigo até o TTL expirar.

## 3. Estratégia de leitura e escrita

O padrão implementado nos endpoints cacheados é:

1. O Service calcula a chave `locamais:` do recurso.
2. Tenta ler no Redis.
3. Em **HIT**, devolve o valor cacheado; endpoints com controle por ator aplicam autorização antes de retornar o valor.
4. Em **MISS** ou falha de leitura Redis, consulta MySQL e monta a resposta com as relações previstas.
5. Tenta armazenar o resultado no Redis com o TTL do endpoint.
6. Devolve a resposta do banco. Falha Redis em `SET` não deve impedir o retorno.

MySQL é sempre a fonte oficial. Operações de escrita invalidam chaves depois que a escrita foi confirmada; nas transações, os `DEL` são executados depois que a transação termina com sucesso. Falha de `DEL` ou de localização dos IDs dependentes é registrada e não desfaz a operação MySQL. A política direta e cruzada está implementada nos caminhos listados na seção 5 e detalhada no ADR-003. As respostas de escrita de carro, endereço e vistoria consultam o banco sem usar a leitura cacheada, evitando repopular chaves durante PATCH.

## 4. Caches implementados

Os caminhos, TTLs e chaves abaixo foram conferidos nos Services:

| Módulo | Endpoint | Chave Redis | TTL | Status do cache direto |
|---|---|---|---:|---|
| `usuario` | `GET /usuarios/:id` | `locamais:usuario:{id}` | 300s | Implementado |
| `cliente` | `GET /clientes/:id` | `locamais:cliente:{id}` | 300s | Implementado |
| `endereco` | `GET /enderecos/:id` | `locamais:endereco:{id}` | 600s | Implementado |
| `revisao` | `GET /revisoes/carro/:carroId/status` | `locamais:revisao:carro:{carroId}` | 300s | Implementado |
| `vistoria` | `GET /vistorias/:id` | `locamais:vistoria:{id}` | 600s | Implementado |
| `carro` | `GET /carros/:id` | `locamais:carro:{id}` | 60s | Implementado |
| `reserva` | `GET /reservas/:id` | `locamais:reserva:{id}` | 120s | Implementado |

As chaves usam o identificador da rota e o prefixo comum `locamais:`. O status de revisão usa `locamais:revisao:carro:{carroId}` sem sufixo adicional. Não foi encontrada divergência entre os TTLs solicitados pelo ADR e os TTLs configurados nos sete Services.

### 4.1 Conteúdo cacheado relevante para consistência

- **Usuário:** a consulta carrega `client.address`; `Usuario.toJSON()` expõe o usuário e o cliente serializado com endereço. A entidade de usuário usa uma lista explícita de campos e exclui senha/hash.
- **Cliente:** carrega `user` e `address`; o JSON inclui atributos cadastrais, usuário público e endereço.
- **Endereço:** serializa seus próprios campos; não inclui o objeto cliente.
- **Carro:** a resposta serializa foto, placa, modelo, marca, categoria, ano, status, valor da diária e quilometragem; omite a coleção de reservas. O snapshot Redis é construído sem `foto`.
- **Reserva:** carrega e serializa `client` e `car`, além de status, período e valor total.
- **Status de revisão:** resposta plana com identificador do carro, placa, quilometragem, revisão mais recente/próxima e situação.
- **Vistoria:** a consulta carrega `locacao.reservation.client`. A resposta pode conter campos serializados da locação, da reserva e do cliente; esses dados não devem ser tratados como imutáveis em relação às operações desses módulos.

Listagens completas e consultas de disponibilidade não usam esses caches. Autenticação/login e endpoints de pagamento/locação também não foram definidos como caches por este ADR.

### 4.2 Cache híbrido do carro e foto

O cache `locamais:carro:{id}` (TTL 60s) contém os atributos gerais do carro, mas exclui `foto`. Em HIT, `CarroService.findOne` consulta no MySQL somente `id` e `foto`, combina a foto atual com os atributos gerais cacheados e não usa eventual foto de uma chave anterior. Em MISS ou falha Redis, a consulta completa ao MySQL fornece os dois conjuntos; a resposta mantém `foto`, enquanto o valor gravado no Redis a omite. A leitura adicional de duas colunas no HIT é intencional: mantém a foto atual sem abrir mão do cache nos demais atributos. Chaves antigas com foto são seguras porque o campo é sempre sobrescrito pela projeção atual do banco.

O cache de reserva também armazena o carro aninhado sem `foto`; em HIT, `ReservaService` consulta a foto atual antes de responder. Listagens de reservas e respostas de locação já são carregadas do MySQL com os relacionamentos, sem consultas individuais adicionais.

## 5. Invalidação: implementado e pendente

### Implementado no código

- `UsuarioService`: invalida `locamais:usuario:{id}` e o cliente relacionado em update/desativação.
- `ClienteService`: invalida a própria chave e, em atualização cadastral, os caches de usuário, reservas e vistorias relacionados; desativação invalida a chave de cliente e usuário, sem limpar reservas/vistorias que não serializam `user.active`.
- `EnderecoService`: invalida sua chave e agregados cliente/usuário relacionados em criação e atualização. A remoção é atualmente bloqueada por regra de negócio.
- `RevisaoService`: invalida o status do carro em criação, atualização e remoção; criação também invalida carro e reservas do veículo por alterar quilometragem.
- `CarroService`: invalida `locamais:carro:{id}` e reservas associadas após atualização e exclusão; invalida o status de revisão em mudança real de placa e exclusão.
- `ReservaService`: invalida `locamais:reserva:{id}` e vistorias associadas após atualização e cancelamento. Criação de UUID novo não tem chave anterior.
- `LocacaoService`: após commit, invalida vistorias na mudança de status da locação e, em retirada/devolução, carro, reserva de origem e reservas do mesmo carro.
- `VistoriaService`: invalida `locamais:vistoria:{id}` após atualização. A criação retorna dados do MySQL sem aquecer o cache.

### Cobertura e limitações segundo o ADR-003

Os Services invalidam somente respostas que incorporam campos afetados. A localização é feita por consultas direcionadas no MySQL pelo `CacheInvalidationService`; a matriz e os casos sem invalidação necessária estão detalhados no ADR-003.

As respostas PATCH de `CarroService`, `EnderecoService` e `VistoriaService` são montadas por consultas diretas ao banco, não pelo GET cacheado. A criação de vistoria também não aquece a chave nova ao montar a resposta do POST. Assim, após invalidação, a reconstrução ocorre no próximo GET.

### Regra arquitetural adotada

Após a escrita MySQL confirmada, remover as chaves próprias e dependentes afetadas, sem escrever manualmente objetos novos em caches dependentes. O próximo GET deve consultar MySQL em MISS, reconstruir a resposta e gravá-la com o TTL original. Para a política detalhada, consultar [ADR-003](./ADR-003-politica-consistencia-invalidation-cache-redis.md).

## 6. Segurança e limitações

- Não armazenar senha, hash de senha, JWT ou credenciais Redis.
- A serialização da entidade de usuário exclui explicitamente o hash de senha. Outras respostas contêm os campos que já fazem parte dos contratos dos endpoints; dados pessoais continuam sujeitos às permissões de acesso existentes.
- Autorização deve ser verificada antes de servir cache; a chave não substitui guards nem regras de propriedade.
- Se Redis falhar em leitura, o Service consulta MySQL. Se falhar em gravação, a resposta do MySQL continua. Se falhar em invalidação, a alteração confirmada não é revertida e dados antigos podem permanecer até o TTL específico do cache expirar.
- TTL é proteção adicional, não substituto de invalidação explícita.
- MySQL e Redis não participam de uma transação atômica conjunta; a invalidação é best-effort.

## 7. Testes e validação

Os specs unitários existentes cobrem HIT/MISS, chaves, TTLs e cenários de falha/autorização em diferentes módulos. Os testes unitários do colaborador de invalidação verificam consulta de IDs e chaves dependentes. A nova suíte `npm run test:e2e:redis` está separada dos e2e SQLite e exige MySQL/Memurai dedicados; seus cenários incluem os sete GETs, verificação do JSON/TTL, instrumentação de SELECT em HIT e cenários HTTP iniciais de invalidação. Ela ainda não foi executada contra serviços reais neste ambiente e não cobre toda a matriz cruzada nem injeção isolada das falhas.

Há `api/scripts/redis-smoke-test.ts`, que exercita a camada Redis contra um servidor real (PING, SET, GET, JSON, EXISTS, TTL, expiração e DEL). Há também um script de teste do cache de revisão com Memurai e repositórios simulados. Esses scripts comprovam operações Redis ou o fluxo de serviço isolado; não equivalem a testes HTTP integrados dos sete endpoints com invalidação cruzada. Não se afirma aqui que tais testes HTTP tenham sido realizados.

## 8. Decisões históricas e relação com ADRs

A prioridade original dos módulos foi `usuario`, `cliente`, `endereco`, `revisao`, `vistoria`, `carro`, `reserva`; essa sequência histórica foi seguida para a implantação dos caches. A decisão agora complementada pelo ADR-003 é que invalidação cruzada, quando os dados serializados exigirem, deve apagar a chave dependente e deixar sua reconstrução para um GET posterior — não atualizar manualmente o cache.

Este ADR descreve infraestrutura e escopo dos caches. O [ADR-003](./ADR-003-politica-consistencia-invalidation-cache-redis.md) é a referência para política, dependências, estratégia de localização de IDs e plano de implementação/testes cruzados.
