# ADR-003 — Política de Consistência e Invalidação dos Caches Redis

## Status

Aceito e implementado. A infraestrutura, os sete caches diretos e as invalidações cruzadas descritas abaixo estão implementados por invalidação direcionada pós-escrita. Os testes unitários foram ampliados. Existe uma suíte HTTP MySQL/Memurai em construção, mas a validação integrada completa continua pendente.

## 1. Contexto e problema

O [ADR-002 — Estratégia de Cache Redis por Módulo](./ADR-002-estrategia-cache-redis.md) define a infraestrutura, as sete respostas cacheadas, chaves e TTLs. A inspeção dos Services, relações carregadas e serializers confirmou respostas com atributos de outras entidades. As invalidações diretas anteriores à implementação desta política não removiam todas as chaves dependentes. Escritas de `LocacaoService` e `RevisaoService` também alteram campos usados em respostas cacheadas.

Este ADR separa explicitamente:

- **Implementado:** infraestrutura Redis, caches dos sete endpoints e invalidações diretas descritas no ADR-002.
- **Implementado:** invalidações cruzadas abaixo e consultas ao MySQL para obter IDs relacionados; respostas de escrita evitam aquecer caches.
- **Em andamento:** suíte `npm run test:e2e:redis` para os sete GETs e invalidações HTTP iniciais; exige banco `locamais_cache_integration` e Memurai isolados.
- **Pendente:** executar a suíte em infraestrutura dedicada, completar os cruzamentos de reserva/vistoria/revisão/locação e testar falhas SQL/Redis sem afetar serviços compartilhados. Falha de consulta SQL de dependentes pode deixar chaves antigas até o TTL expirar.
- **Recomendado:** consulta de IDs dependentes no MySQL e remoção direcionada das chaves após commit.

## 2. Objetivo

Manter respostas cacheadas consistentes com os dados serializados sem transformar Redis em fonte de verdade e sem atualização manual de objetos em caches dependentes.

## 3. Decisão arquitetural

Adotar **invalidação de chaves dependentes com reconstrução sob demanda (lazy cache regeneration)**:

1. MySQL permanece como fonte oficial.
2. Após uma escrita MySQL bem-sucedida e o commit da transação, remover a chave própria e as chaves dependentes cujo conteúdo mudou.
3. Não executar `SET` para propagar/reconstruir manualmente objetos em caches dependentes.
4. O próximo GET do recurso afetado encontra MISS, consulta o MySQL, carrega as relações atuais, serializa a resposta e grava-a com o TTL original.
5. HIT passa a ocorrer nas leituras subsequentes até nova invalidação ou expiração.
6. Escritas que não alteram nenhum campo serializado em uma chave não devem removê-la.

O comportamento descrito é implementado pelos Services e por `CacheInvalidationService`, registrado pelo `CacheInvalidationModule` global, separado do módulo que apenas encapsula o cliente Redis. As queries dependentes usam FKs MySQL; os `DEL` não gravam nem atualizam objetos de cache.

## 4. Escopo atual dos caches

Os valores abaixo foram conferidos diretamente nos Services. A arquitetura de conexão, `RedisService` e o fluxo geral de GET estão documentados no ADR-002.

| Módulo | Endpoint | Chave | TTL |
|---|---|---|---:|
| `usuario` | `GET /usuarios/:id` | `locamais:usuario:{id}` | 300s |
| `cliente` | `GET /clientes/:id` | `locamais:cliente:{id}` | 300s |
| `endereco` | `GET /enderecos/:id` | `locamais:endereco:{id}` | 600s |
| `revisao` | `GET /revisoes/carro/:carroId/status` | `locamais:revisao:carro:{carroId}` | 300s |
| `vistoria` | `GET /vistorias/:id` | `locamais:vistoria:{id}` | 600s |
| `carro` | `GET /carros/:id` | `locamais:carro:{id}` | 60s |
| `reserva` | `GET /reservas/:id` | `locamais:reserva:{id}` | 120s |

## 5. Conteúdo das respostas e matriz de dependências

A matriz considera somente dados carregados e serializados nos endpoints, não apenas FKs existentes no schema. “Obrigatória” significa que a chave dependente deve ser removida se a operação efetivamente mudar um campo presente nessa resposta. As marcações “implementado” descrevem os caminhos cobertos atualmente.

| Origem/alteração | Cache próprio (estado atual) | Cache dependente e decisão | Justificativa baseada na resposta |
|---|---|---|---|
| Usuário: alterar nome, email ou `active` | `usuario:{userId}` — **implementado** em `UsuarioService.update`/`deactivateAccount` | `cliente:{clientId}` — **obrigatória, implementada** quando há cliente | `ClienteService.findOne` carrega `user`; `Cliente.toJSON()` inclui os campos públicos do usuário. A senha/hash não é serializada e não causa dependência cruzada. |
| Usuário: desativação direta (`DELETE /usuarios/:id`) | `usuario:{userId}` — **implementado** | `cliente:{clientId}` — **obrigatória, implementada** se usuário possuir cliente | A resposta cacheada do cliente inclui `user.active`; a chave relacionada é localizada pela FK `clientes.user_id`. |
| Cliente: alterar atributos cadastrais | `cliente:{clientId}` — **implementado** | `usuario:{userId}`, reservas do cliente e vistorias ligadas às locações dessas reservas — **implementadas** | `Usuario.findOne` inclui `client.address`; reserva inclui `client`; vistoria inclui `locacao.reservation.client`. IDs relacionados são consultados no MySQL após a escrita. |
| Cliente: desativar | `cliente:{clientId}` e `usuario:{userId}` — **implementado** pelo caminho `ClienteService.remove` → `UsuarioService.deactivateAccount` | Reserva/vistoria — **desnecessária para os campos atuais** | As relações `client` carregadas por Reserva/Vistoria não incluem o objeto `user`; portanto não contêm `active`. Se consultas/serialização passarem a carregar `client.user`, reavaliar. |
| Endereço: criar para cliente existente | A chave `endereco:{newId}` não tem entrada anterior | `cliente:{clientId}` e `usuario:{userId}` — **implementadas** | As respostas cacheadas de cliente/usuário podem representar ausência de endereço. Os agregados associados são invalidados após salvar. Criação transacional de cliente totalmente novo não requer invalidação de chaves de IDs novos. |
| Endereço: atualizar campos | `endereco:{addressId}` — **implementado** | `cliente:{clientId}` e `usuario:{userId}` — **implementadas** | Ambos os agregados serializam o endereço. `client_id` é imutável no DTO atual; se vier a mudar, invalidar agregados do vínculo antigo e do novo. |
| Endereço: excluir | A exclusão é rejeitada por `EnderecoService.remove` — **não aplicável atualmente** | Se a regra de negócio mudar: chave própria e agregados cliente/usuário — **obrigatórias** | Não há exclusão bem-sucedida para invalidar hoje. |
| Carro: atualizar qualquer campo exposto por `Carro.toJSON()` | `carro:{carId}` — **implementado** | Reservas que apontam para esse carro — **obrigatórias, implementadas** | A reserva serializa `car`, que inclui placa, modelo, marca, categoria, ano, status, diária e quilometragem. Alteração de qualquer um desses campos muda o JSON da reserva. |
| Carro: alterar placa | `carro:{carId}` — **implementado** | `revisao:carro:{carId}` — **implementado** | O status de revisão inclui placa. `UpdateCarroDto` não permite alterar quilometragem; se isso mudar, o status de revisão também deve ser invalidado. Outros campos atuais de carro não integram a resposta de status de revisão. |
| Carro: excluir | `carro:{carId}` e `revisao:carro:{carId}` — **implementado** | Reservas — **desnecessário no fluxo permitido** | A exclusão é bloqueada se existir reserva e a FK restringe exclusão; não deve haver resposta de reserva válida referenciando o carro excluído. |
| Revisão: criar | `revisao:carro:{carId}` — **implementado** | `carro:{carId}` e reservas do carro — **obrigatórias, implementadas** | `RevisaoService.create` atualiza `Carro.quilometragem`, serializada tanto no carro quanto no campo `car` da reserva. |
| Revisão: atualizar data, descrição ou valor | `revisao:carro:{carId}` — **implementado** | Carro, reserva e vistoria — **desnecessários** | Alterar data pode mudar qual revisão é a mais recente e o cálculo do status; esses outros caches não incluem revisão. A operação não muda a quilometragem. |
| Revisão: excluir | `revisao:carro:{carId}` — **implementado** | Carro, reserva e vistoria — **desnecessários** | A exclusão pode mudar o status calculado; não atualiza a quilometragem persistida do carro. |
| Reserva: criar UUID novo | Nenhuma chave própria anterior; GET futuro cria a entrada | Vistoria — **desnecessária** | Não há locação/vistoria que já referencie o novo ID. |
| Reserva: atualizar ou cancelar | `reserva:{reservationId}` — **implementado** | `vistoria:{vistoriaId}` associada à locação da reserva — **implementada quando há dependente** | `VistoriaService.findOne` carrega `locacao.reservation.client`; status, datas e valor da reserva são serializados. Reservas sem locação não têm vistoria dependente. A consulta de IDs e a invalidação ocorrem após escrita confirmada. |
| Vistoria: atualizar observações/fotos | `vistoria:{vistoriaId}` — **implementado** | Outros seis caches — **desnecessários** | Esses campos só aparecem na própria resposta de vistoria. |
| Vistoria: criar UUID novo | Sem chave anterior; `create` retorna o resultado consultado diretamente no MySQL e não aquece a chave | Outros caches — **desnecessários** | Não há cache de listagem/histórico de vistorias; ID novo não tem dependentes anteriores. O GET posterior é responsável por popular a chave. |
| Locação: cancelar enquanto aguarda retirada | Locação não é cacheada | Vistorias ligadas à `locacaoId` — **implementadas** se existirem | A resposta de vistoria contém a locação, incluindo status. Não há alteração de carro/reserva nesse caminho. |
| Locação: registrar retirada | Locação não é cacheada | `vistoria:{id}` da locação; `carro:{carId}`; reservas associadas ao carro — **implementadas** | A operação altera status/data da locação e status do carro. Vistoria contém locação; reserva contém o carro com status. O status de revisão não inclui status do veículo. |
| Locação: registrar devolução | Locação não é cacheada | Vistorias da locação; `reserva:{reservationId}`; `carro:{carId}`; demais reservas associadas ao carro — **implementadas** | Altera status/data/valor da locação, status da reserva e status do carro. Esses campos são serializados diretamente ou por relações nas respostas cacheadas. |
| Alterar associação/vínculo | Chave própria afetada | Agregados do vínculo antigo e do novo — **obrigatória se a relação aparece na resposta** | Evita cópias antigas tanto no agregado que perdeu a relação quanto naquele que a recebeu. Os DTOs atuais mantêm imutáveis os vínculos usuário/cliente/endereço; mudanças em relações de reserva são limitadas pelas regras de estado. |

### 5.1 Relações carregadas confirmadas no código

- `UsuarioService.findOne`: `client.address`; `Usuario.toJSON()` remove explicitamente senha/hash, e o cliente serializa endereço.
- `ClienteService.findOne`: `user` e `address`; serializa atributos de cliente e usuário público/endereço.
- `Endereco.toJSON()`: somente campos do endereço; omite o cliente.
- `Carro.toJSON()`: campos públicos do veículo, incluindo status, diária e quilometragem; omite a coleção inversa de reservas.
- `ReservaService.findOne`: `client` e `car`; `Reserva.toJSON()` inclui as duas relações.
- `RevisaoService.verificarRevisaoPeriodica`: objeto plano com placa, quilometragem e valores derivados da revisão mais recente.
- `VistoriaService.findOne`: `locacao.reservation.client`; `Vistoria`, `Locacao` e `Reserva` serializam os relacionamentos carregados. Portanto, a resposta pode expor campos de locação, reserva e cliente.

## 6. Estratégia para localizar registros dependentes

| Alternativa | Avaliação |
|---|---|
| Consultar FKs/relacionamentos no MySQL | **Recomendada para o porte atual.** MySQL é fonte dos vínculos; consultas direcionadas por `client_id`, `car_id`, `reservation_id` e `locacao_id` evitam estado auxiliar. Capturar IDs anterior/novo antes da alteração e executar `DEL` somente depois do commit. |
| Sets de índices no Redis | Não recomendado agora. Exigiria manter dados e Sets sincronizados, tratar falhas parciais, expiração e reconstrução de índices; duplicaria relações que já existem no MySQL. |
| Serviço centralizado/eventos/Outbox | Não introduzir barramento ou Outbox nesta fase. Se consultas/invalidações repetidas justificarem, pode-se extrair um helper pequeno que receba IDs já localizados no MySQL. Evitar dependência circular entre Services de domínio. |

Não usar `KEYS` ou varredura global como estratégia normal de invalidação. Remover apenas as chaves associadas aos IDs dependentes encontrados.

## 7. Tratamento de falhas e limitações

- Executar `DEL` somente após a escrita MySQL e o commit da transação. Falha MySQL/rollback não deve apagar chaves.
- Falha Redis em invalidação não reverte o MySQL; registrar erro sem credenciais/dados sensíveis e concluir a operação de negócio.
- Como não há transação distribuída ou Outbox, uma falha Redis pode deixar valor antigo até expirar pelo TTL correspondente (60, 120, 300 ou 600 segundos). TTL é proteção adicional, não consistência forte.
- Invalidação best-effort não garante remoção enquanto o servidor Redis estiver indisponível.
- Requisições de escrita não devem usar valores cacheados para decisões transacionais/críticas; verificar estado atual no MySQL.
- Não armazenar senha, hash de senha, JWT ou credenciais Redis. A resposta de cliente contém dados cadastrais que já pertencem ao contrato autorizado da API; sua presença no cache não deve ser ampliada.

## 8. Implementado, pendente e recomendado

### Implementado

- `RedisModule` global, ioredis, `RedisService` e conexão usada pela aplicação.
- HIT/MISS e os TTLs dos sete endpoints listados na tabela da seção 4.
- Invalidações diretas: usuário em update/desativação; cliente em update/desativação; endereço em update; revisão em create/update/delete; carro em update/delete e revisão em mudança de placa/delete; reserva em update/cancel; vistoria em update.
- Captura best-effort de falhas Redis nos Services de cache e uso do MySQL em falhas de leitura/gravação.

### Pendente

- Executar e completar os testes integrados HTTP contra MySQL + Memurai cobrindo HIT/MISS e todos os cruzamentos entre os sete endpoints.
- Uma falha da consulta SQL que localiza IDs dependentes é registrada; as chaves dependentes não encontradas podem permanecer até expiração pelo TTL.

### Recomendado

- Continuar localizando IDs dependentes por queries direcionadas no MySQL e invalidar após commit. Se algum DTO permitir troca de vínculo futuramente, capturar os IDs anterior e novo antes da escrita.
- Testar com Memurai real e dados isolados a remoção das chaves corretas, MISS/reconstrução, JSON atual, TTL original e HIT subsequente.
- Manter métricas/logs de falha de invalidação e, se necessário, instrumentar HIT/MISS sem registrar valores de cache ou dados sensíveis.

## 9. Estratégia de testes

### Unitários com mocks

Para cada operação que for implementada, testar:

1. Invalidação direta após escrita bem-sucedida.
2. Invalidação cruzada somente dos dependentes realmente afetados.
3. Nenhum `DEL` se MySQL falhar ou a transação sofrer rollback.
4. Falha de `DEL` não desfaz escrita já confirmada, é registrada e não permite que a resposta da escrita seja montada a partir de uma chave antiga.
5. Cache MISS consulta MySQL, serializa a resposta atual e usa o TTL original.
6. HIT após reconstrução evita nova consulta ao repositório.
7. Alteração/associação/desvinculação invalida IDs dos vínculos antigo e novo.
8. Caches sem dependência permanecem preservados.

Mocks verificam chamadas e ordem no Service; não provam conectividade Redis real, serialização ioredis, TTL/expiração no servidor nem wiring HTTP.

### Integração Memurai e API

O smoke test Redis existente cobre PING, SET/GET, JSON, EXISTS, TTL, expiração e DEL com Memurai. O script de revisão exercita um Service com Redis real e repositories simulados. Os testes unitários cobrem IDs e chaves do serviço auxiliar de invalidação. A suíte HTTP dedicada foi adicionada, mas ainda não foi validada com MySQL/Memurai reais neste ambiente; portanto não se afirma execução integrada concluída.

`api/test/REDIS-INTEGRATION.md` descreve a configuração isolada e o comando. A suíte em `api/test/redis-caches.redis-integration-spec.ts` verifica os sete caches, JSON/TTL e SELECTs no HIT, além de PATCH HTTP para agregados de usuário, cliente, endereço e carro. A execução real ainda depende de MySQL dedicado e Memurai em porta separada; retirada/devolução, outros cruzamentos e injeção de falhas permanecem pendentes. Não usar Redis compartilhado nem limpar chaves fora dos IDs criados pela suíte.

## 10. Consequências

### Positivas

- MySQL continua como única fonte de verdade.
- Cache dependente é refeito pelo mesmo caminho de leitura e serializer do endpoint.
- Não há cópia manual de valores entre chaves, reduzindo divergência de contratos.
- Queries direcionadas preservam somente chaves realmente relacionadas.

### Custos e limitações

- Consultas a FKs/joins adicionam trabalho ao MySQL durante algumas escritas.
- Falha de Redis durante `DEL` deixa eventual obsolescência até o TTL expirar.
- Falhas na query de dependentes podem deixar chaves antigas até o TTL; não há transação distribuída entre MySQL e Redis.
- Módulos que alteram campos de outros módulos precisam localizar IDs sem chamadas circulares entre Services.

## 11. Relação com o ADR-002

O [ADR-002](./ADR-002-estrategia-cache-redis.md) documenta arquitetura Redis, conexão, fluxo geral de cache, endpoints, chaves e TTLs. Este ADR complementa-o com a política detalhada de invalidação cruzada, sua implementação e a validação integrada ainda pendente. Nenhum TTL ou cache novo é definido aqui.
