# ADR-002 — Estratégia de Cache com Redis por Módulo

## Status

Implementado; os sete caches foram auditados e implementados no backend.

## Contexto

A integração com Redis/Memurai já foi implementada e validada (ADR-001). Agora é necessário definir quais módulos e endpoints utilizarão cache, com quais TTLs e estratégia de invalidação, sem comprometer consistência de dados críticos nem armazenar informações sensíveis.

## Decisão

Aplicar cache apenas nos endpoints abaixo, com TTL definido e invalidação explícita após escritas. O Redis é uma camada best-effort; MySQL permanece como fonte oficial. Falhas de leitura usam MySQL, falhas de gravação não afetam a resposta e falhas de invalidação são registradas sem desfazer uma escrita já confirmada.

## Endpoints com Cache Implementado

| Prioridade | Módulo | Endpoint | TTL | Justificativa |
|------------|--------|----------|-----|---------------|
| 1 | `usuario` | `GET /usuarios/:id` | 300s | Mais consultado da API (JwtStrategy valida o usuário a cada request autenticado). Dados não sensíveis, mudança rara. |
| 2 | `cliente` | `GET /clientes/:id` | 300s | Usado em reservas, locações e vistorias. Dados cadastrais estáveis. |
| 3 | `endereco` | `GET /enderecos/:id` | 600s | Endereço muda raramente. Acesso restrito a admin/funcionário. |
| 4 | `revisao` | `GET /revisoes/carro/:carroId/status` | 300s | Cálculo de revisão periódica; muda apenas quando nova revisão é registrada. |
| 5 | `vistoria` | `GET /vistorias/:id` | 600s | Evidência histórica, raramente alterada após criação. |
| 6 | `carro` | `GET /carros/:id` | 60s | Dados do veículo mudam frequentemente (status: disponível/alugado/manutenção). TTL curto. |
| 7 | `reserva` | `GET /reservas/:id` | 120s | Status muda ocasionalmente (pendente → confirmada → concluída/cancelada). TTL curto. |

## Estratégia de leitura

Em cada endpoint, tenta-se ler no Redis. Um HIT devolve a representação atual da API; um MISS consulta MySQL e tenta gravar a resposta com o TTL definido. Falha de leitura é tratada como MISS. Endpoints com autorização verificam o ator antes de devolver dados, inclusive em HIT. Senhas, hashes de senha e tokens não são armazenados.

## Endpoints que NÃO Devem Usar Cache

- `autenticacao`: login, registro, `/me` (segurança).
- `carro`: `GET /carros` (listagem/disponibilidade — restrição de consistência).
- `reserva`: `GET /reservas/disponibilidade` (consulta de disponibilidade em período — restrição explícita).
- `pagamento`: todos os GET (dados financeiros).
- `locacao`: todos os GET (transacionais, status mutável, impacto financeiro).
- Listagens completas (`findAll`) de qualquer módulo.
- Login e autenticação.

## Estratégia de Invalidação

A invalidação ocorre no **Service**, após a operação de escrita ser confirmada no banco.

### Padrão de Chave

Todas as chaves utilizam o prefixo `locamais:`.

```
locamais:usuario:{id}
locamais:cliente:{id}
locamais:endereco:{id}
locamais:carro:{id}
locamais:reserva:{id}
locamais:vistoria:{id}
locamais:revisao:carro:{carroId}
```

### Mapeamento de Invalidação

| Operação de Escrita | Chave(s) a Invalidar |
|---------------------|---------------------|
| `PATCH /usuarios/:id` | `locamais:usuario:{id}` |
| `DELETE /usuarios/:id` | `locamais:usuario:{id}` |
| `PATCH /clientes/:id` | `locamais:cliente:{id}` |
| `DELETE /clientes/:id` | `locamais:cliente:{id}` |
| `PATCH /enderecos/:id` | `locamais:endereco:{id}` |
| `POST /revisoes` (carro X) | `locamais:revisao:carro:{X}` |
| `PATCH /revisoes/:id` | `locamais:revisao:carro:{carroId}` |
| `DELETE /revisoes/:id` | `locamais:revisao:carro:{carroId}` |
| `PATCH /carros/:id` | `locamais:revisao:carro:{id}` (somente quando a placa realmente muda) e `locamais:carro:{id}` |
| `DELETE /carros/:id` | `locamais:revisao:carro:{id}` e `locamais:carro:{id}` |
| `PATCH /reservas/:id` | `locamais:reserva:{id}` |
| `PATCH /reservas/:id/cancelar` | `locamais:reserva:{id}` |
| `PATCH /vistorias/:id` | `locamais:vistoria:{id}` |

### Cuidado arquitetural na invalidação cruzada

O `CarroService` invalida o cache de revisao injetando o `RedisService`
do modulo Redis (`@Global()`). Ele **nao importa** o `RevisaoModule` nem o
`RevisaoService`, evitando dependencia circular: `RevisaoService` ja importa
`CarroService`. Nenhuma nova conexao ioredis e criada.

O `CarroService` também invalida `locamais:carro:{id}` em alterações e exclusões. O `ReservaService` utiliza `locamais:reserva:{id}` com TTL de 120s e verifica autorização em HIT e MISS; atualização e cancelamento invalidam somente a reserva afetada. Não se invalida na criação: IDs novos não possuem entrada de cache anterior. Não há invalidação cruzada entre reserva e vistoria: a resposta cacheada de vistoria não carrega campos mutáveis da reserva.

### Estado da auditoria

| Módulo | Endpoint | TTL | Status |
|---|---|---:|---|
| `usuario` | `GET /usuarios/:id` | 300s | Implementado |
| `cliente` | `GET /clientes/:id` | 300s | Implementado |
| `endereco` | `GET /enderecos/:id` | 600s | Implementado |
| `revisao` | `GET /revisoes/carro/:carroId/status` | 300s | Implementado |
| `vistoria` | `GET /vistorias/:id` | 600s | Implementado |
| `carro` | `GET /carros/:id` | 60s | Implementado |
| `reserva` | `GET /reservas/:id` | 120s | Implementado |

Os caches de `carro` e `reserva` foram adicionados nesta auditoria. Se uma invalidação Redis falhar, a entrada antiga pode permanecer até seu TTL expirar.

## Riscos de Inconsistência e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Cache stale em `carro.status` | TTL curto (60s) + invalidação imediata em `PATCH /carros/:id`. |
| Reserva confirmada vs. cache antigo | TTL curto (120s) + invalidação em `PATCH /reservas/:id` e `/cancelar`. |
| Usuário desativado ainda acessível via cache | O `JwtStrategy.validate()` já recarrega o usuário do banco a cada request; o cache é apenas otimização secundária. |
| Falha na invalidação (Redis indisponível) | O TTL garante expiração eventual; a entrada antiga pode permanecer até expirar (300s no status de revisão) e a aplicação continua funcionando sem cache. |

## Consultas que Permanecem Diretamente no MySQL

- Disponibilidade de carros (`GET /carros`, `GET /reservas/disponibilidade`).
- Todas as operações de pagamento.
- Todas as operações de locação.
- Listagens completas (`findAll`).
- Login e autenticação.

## Ordem Recomendada de Implementação

1. `usuario` — `GET /usuarios/:id`
2. `cliente` — `GET /clientes/:id`
3. `endereco` — `GET /enderecos/:id`
4. `revisao` — `GET /revisoes/carro/:carroId/status`
5. `vistoria` — `GET /vistorias/:id`
6. `carro` — `GET /carros/:id`
7. `reserva` — `GET /reservas/:id`

## Primeiro Módulo Implementado

**`usuario` — `GET /usuarios/:id`** (primeiro da ordem definida).

Justificativa: maior volume de acesso (validado a cada request autenticado via JWT), baixo risco (sem dados sensíveis), alta estabilidade (dados de conta mudam raramente) e invalidação simples (apenas `PATCH` e `DELETE` de usuário).

## Restrições respeitadas

- Nenhuma entidade, migration ou módulo de autenticação será alterada nesta etapa.
- O cache de carros limita-se a `GET /carros/:id`; listagens e disponibilidade permanecem sem cache.
- Nenhuma segunda instância Redis será criada.
- Configurações do MySQL permanecem inalteradas.
- Testes existentes são preservados; os novos specs cobrem HIT/MISS, TTL, autorização e falhas Redis.
