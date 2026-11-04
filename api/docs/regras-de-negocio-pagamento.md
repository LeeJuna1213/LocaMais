# Regras de negócio — Módulo Pagamento

Este documento apresenta, de forma didática, as regras de negócio implementadas
no módulo `Pagamento` do projeto LocaMais.

---

## 1. Objetivo do módulo Pagamento

O módulo `Pagamento` registra e processa pagamentos referentes às locações do
LocaMais. Como este projeto possui finalidade acadêmica e demonstrativa, não
há integração financeira real com bancos ou gateways externos. O sistema
implementa um **pagamento simulado**, no qual o usuário seleciona uma forma de
pagamento, confirma a operação e o backend simula a aprovação da transação.

Quando o pagamento é confirmado e aprovado, o sistema gera um recibo
demonstrativo que deixa claro se tratar de um registro simulado, não de um
comprovante bancário real.

---

## 2. Diferença entre pagamento real e pagamento simulado

| Pagamento real | Pagamento simulado (LocaMais) |
|----------------|-------------------------------|
| Integra com gateway bancário ou provedor de pagamento | Simula o processamento internamente |
| Armazena credenciais, tokens e dados de cartão | Não armazena dados financeiros sensíveis |
| Transação efetiva com débito/crédito real | Operação demonstrativa sem movimento financeiro real |
| Comprovante bancário real | Recibo demonstrativo com aviso de simulação |

O aviso presente em todo recibo é:

> Pagamento simulado para fins demonstrativos. Não representa uma transação financeira real.

---

## 3. Formas de pagamento disponíveis

O enum `MetodoPagamento` define as seguintes opções:

| Método | Valor | Descrição |
|--------|-------|-----------|
| PIX | `pix` | Transferência instantânea (simulado) |
| Cartão de Crédito | `cartao_credito` | Pagamento com cartão de crédito (simulado) |
| Cartão de Débito | `cartao_debito` | Pagamento com cartão de débito (simulado) |
| Dinheiro | `dinheiro` | Pagamento em espécie (simulado) |

Esses valores são usados consistentemente entre backend, documentação Swagger e
frontend.

---

## 4. Significado dos status de pagamento

O enum `StatusPagamento` define as seguintes situações:

| Status | Valor | Significado |
|--------|-------|-------------|
| PENDENTE | `pendente` | Pagamento registrado, aguardando confirmação. |
| APROVADO | `aprovado` | Pagamento confirmado após processamento simulado. |
| RECUSADO | `recusado` | Pagamento recusado pelo gateway simulado. |
| CANCELADO | `cancelado` | Pagamento cancelado antes da confirmação. |

O pagamento inicia com status `PENDENTE` e passa para `APROVADO` somente após
a confirmação da operação simulada pelo gateway. O frontend **não pode**
definir diretamente o status do pagamento.

---

## 5. Relacionamento entre Pagamento e Locacao

- Um pagamento pertence a exatamente uma locação (`locacao_id`).
- Uma locação pode gerar um ou vários pagamentos (1:N).
- Pagamentos parciais são permitidos: uma locação pode ter mais de um registro
  de pagamento, desde que a soma dos aprovados não exceda o valor devido.
- Cada pagamento está vinculado a exatamente um gateway de pagamento (1:1),
  representado pela entidade `GatewayPagamento`.

A entidade `Locacao` inclui a coleção inversa `pagamentos` para navegação.

---

## 6. Como funciona a simulação do gateway

O `GatewayPagamentoService` é um componente separado do `Pagamento` e
responsável por simular o processamento e a validação das transações.

- Não conecta serviços externos.
- Não armazena senhas, tokens bancários ou credenciais financeiras reais.
- O campo `credenciais` do gateway armazena apenas configurações demonstrativas
  não sensíveis (`gateway-simulado-locamais-v1`).
- O tipo do gateway identifica que a operação utiliza um gateway simulado.

**Regra determinística para aprovação/recusa:**

| Condição | Resultado |
|----------|-----------|
| Valor > 0 | `APROVADO` |
| Valor <= 0 | `RECUSADO` |

Embora o service já impeça valores negativos ou zero antes de chamar o
gateway, essa regra serve como segunda camada de validação.

---

## 7. Como funciona a confirmação do pagamento

A confirmação é feita pela rota `PATCH /pagamentos/:id/confirmar` e aplica as
seguintes regras:

1. O pagamento deve existir e estar com status `PENDENTE`.
2. Não permite confirmação duplicada: um pagamento já `APROVADO` retorna o
   registro existente sem gerar outro recibo ou duplicar o valor pago.
3. Pagamentos `RECUSADO` ou `CANCELADO` não podem ser confirmados.
4. O backend chama o `GatewayPagamentoService` para processar a transação
   simulada.
5. O status é atualizado para `APROVADO` ou `RECUSADO` conforme o resultado.
6. A confirmação é feita dentro de uma transação de banco de dados para
   garantir consistência.

---

## 8. Regras para pagamentos parciais

- Uma locação pode ter vários pagamentos (pagamentos parciais são permitidos).
- O valor de cada pagamento deve ser obtido pelo backend a partir da entidade
  `Locacao` (`valorTotal`).
- O valor do pagamento não pode ser negativo ou igual a zero.
- O valor do pagamento não pode exceder o saldo restante da locação.
- Apenas pagamentos com status `APROVADO` são considerados como valores
  quitados.
- Pagamentos `PENDENTE`, `RECUSADO` ou `CANCELADO` não reduzem o saldo devido.
- Não é permitido que o valor total aprovado ultrapasse o valor devido pela
  locação.
- Durante atualizações de um pagamento pendente, o cálculo do saldo restante
  exclui o próprio pagamento para evitar auto-exclusão.

---

## 9. Como funciona o cálculo do saldo restante

O saldo restante é calculado como:

```
saldo_restante = valor_total_da_locacao - soma_dos_pagamentos_aprovados
```

Apenas pagamentos com status `APROVADO` entram na soma. Pagamentos pendentes,
recusados ou cancelados são ignorados no cálculo.

O endpoint `GET /pagamentos/locacao/:locacaoId/saldo` retorna:
- `valorTotal`: valor total da locação
- `valorPago`: soma dos pagamentos aprovados
- `saldoRestante`: valor total menos valor pago

---

## 10. Como o sistema evita pagamentos duplicados

- Um pagamento já `APROVADO` não pode ser confirmado novamente. Uma segunda
  tentativa de confirmação retorna o registro existente sem gerar outro
  recibo ou duplicar o valor pago.
- Pagamentos `RECUSADO` ou `CANCELADO` não podem ser confirmados.
- Apenas pagamentos `PENDENTE` podem ser atualizados ou excluídos.
- Operações que alteram mais de uma entidade (pagamento + gateway) usam
  transações do banco de dados para garantir consistência.

---

## 11. Como funciona a geração do recibo

O recibo é gerado pela rota `GET /pagamentos/:id/comprovante` e aplica as
seguintes regras:

- Só pode ser gerado para pagamentos com status `APROVADO`.
- Pagamentos `PENDENTE`, `RECUSADO` ou `CANCELADO` não podem gerar recibo.
- Utiliza os dados reais do pagamento registrado no banco, sem aceitar valores
  enviados livremente pelo frontend.
- Contém:
  - Identificação do LocaMais (empresa)
  - Número identificador do recibo (ID do pagamento)
  - Identificador do pagamento
  - Identificação da locação
  - Nome do cliente (quando disponível pela relação com a locação)
  - Veículo associado à locação (marca, modelo e placa)
  - Valor pago
  - Método de pagamento
  - Data e horário da confirmação
  - Status: `APROVADO`
  - Aviso: "Pagamento simulado para fins demonstrativos. Não representa uma
    transação financeira real."

O método `gerarComprovante()` da entidade `Pagamento` valida que o status
é `APROVADO` antes de gerar o comprovante.

---

## 12. Limitações da simulação

- Não há integração com gateways financeiros reais.
- Não são armazenados dados de cartão de crédito, débito ou conta bancária.
- Não há emissão de notas fiscais ou boletos.
- O recibo é um registro demonstrativo, sem valor fiscal.
- A aprovação é determinística (valor > 0 é aprovado) e não reflete regras de
  risco ou análise de crédito reais.

---

## Resumo das regras implementadas

1. Um pagamento pertence a exatamente uma locação (`locacao_id` → `locacoes.id`).
2. Uma locação pode ter vários pagamentos (pagamentos parciais permitidos).
3. Cada pagamento está vinculado a exatamente um gateway de pagamento (1:1).
4. Ao registrar um pagamento, verifica-se se a locação existe.
5. Não é permitido registrar pagamento para locação cancelada.
6. O pagamento inicia com status `PENDENTE` e data registrada pelo backend.
7. O valor do pagamento não pode ser negativo ou igual a zero.
8. O valor do pagamento não pode exceder o saldo restante da locação.
9. Apenas pagamentos `APROVADO` são considerados como valores quitados.
10. Não é permitido que o total aprovado ultrapasse o valor devido pela locação.
11. Não permite confirmação duplicada de pagamento já aprovado.
12. Pagamentos `RECUSADO` ou `CANCELADO` não podem ser confirmados.
13. Apenas pagamentos `PENDENTE` podem ser atualizados ou excluídos.
14. O gateway simulado aprova transações com valor > 0 e recusa valor <= 0.
15. O recibo só pode ser gerado para pagamentos `APROVADO`.
16. O recibo inclui aviso de que se trata de pagamento simulado.
17. Operações que alteram múltiplas entidades usam transações de banco.
18. Não armazena credenciais, senhas ou dados bancários reais.

---
