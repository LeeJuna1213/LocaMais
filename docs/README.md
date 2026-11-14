# Documentação de Arquitetura e Decisões — LocaMais

Esta pasta reúne o planejamento arquitetural, os registros de decisão de arquitetura (ADRs) e a justificativa das escolhas técnicas do backend da API LocaMais.

## Estrutura

```
docs/
├── README.md                      # Este arquivo
├── arquitetura-atual.md           # Visão geral da arquitetura do backend
├── adr/
│   ├── ADR-001-integracao-redis-memurai.md   # Decisão: integracao com Redis/Memurai
│   └── ADR-002-estrategia-cache-redis.md     # Decisao: estrategia de cache por modulo
```

## Como usar

- **Arquitetura atual:** consulte `arquitetura-atual.md` para entender módulos, endpoints, services, entities e DTOs existentes.
- **Decisões tomadas:** cada ADR documenta uma decisão de arquitetura, o contexto, as alternativas consideradas, a decisão adotada e as consequências.
- **Novo ADR:** ao tomar uma nova decisão arquitetural relevante, crie um arquivo `ADR-NNN-titulo.md` na pasta `adr/` seguindo o mesmo modelo.
