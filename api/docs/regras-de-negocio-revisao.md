# Regras de negócio — Módulo Revisão (Revisao)

Este documento apresenta, de forma didática, as regras de negócio implementadas
no módulo `Revisao` do projeto LocaMais.

---

## 1. Objetivo do módulo Revisao

O módulo `Revisao` registra as revisões de manutenção realizadas nos veículos
da locadora. Cada revisão fica vinculada a um único veículo (`Carro`) e armazena
a data, descrição dos serviços, quilometragem no momento e o custo da revisão.

Além de manter o histórico de manutenção, o módulo implementa o **controle de
revisão periódica**, que identifica quando um veículo precisa realizar uma nova
revisão com base na quilometragem.

---

## 2. Relacionamento entre Carro e Revisao

- Um carro (`Carro`) pode possuir várias revisões ao longo do tempo (1:N).
- Cada revisão (`Revisao`) pertence a um único veículo (N:1).
- O lado proprietário do relacionamento está na entidade `Revisao`, por meio
  da chave estrangeira `carro_id` que referencia `cars.id`.
- A entidade `Carro` mantém a coleção inversa `revisoes` apenas para navegação.
- Não existem relacionamentos com `Locacao`, `Vistoria` ou `Cliente`. A revisão
  está diretamente associada ao veículo.

---

## 3. Regras para registrar uma revisão

Ao registrar uma nova revisão (`POST /revisoes`), o serviço aplica as seguintes
regras, em ordem:

1. **Existe o veículo?** O `carroId` informado deve corresponder a um veículo
   cadastrado. Caso contrário, retorna erro 404.
2. **Última revisão:** O sistema busca a última revisão registrada para o mesmo
   veículo, ordenada por data (mais recente primeiro).
3. **Quilometragem válida:** A quilometragem (`km`) informada na nova revisão
   não pode ser inferior à quilometragem da última revisão registrada para o
   mesmo veículo. Isso garante a consistência do histórico.
4. **Registro:** A revisão é criada com data, descrição, quilometragem e valor.
5. **Atualização do odômetro:** A quilometragem atual do veículo
   (`Carro.quilometragem`) é atualizada com o `km` informado na revisão.
6. **Transação:** A gravação da revisão e a atualização do veículo ocorrem na
   mesma transação de banco de dados, garantindo consistência.

Não é permitido que o cliente informe livremente o ID da revisão nem campos
gerenciados pelo backend (`id`, `created_at`, `updated_at`).

---

## 4. Regras para validar a quilometragem

- A quilometragem (`km`) deve ser um número inteiro não negativo.
- Não é permitido registrar uma revisão com `km` inferior à última revisão
  registrada para o mesmo veículo.
- `km` e `carroId` são imutáveis após o registro da revisão (não podem ser
  alterados via `PATCH`). Para corrigir a quilometragem, registre uma nova
  revisão com o valor correto.

---

## 5. Intervalo de revisão periódica adotado

O intervalo inicial adotado é de **10.000 km** entre revisões. Esse valor é
configurável via constante no `RevisaoService` e pode ser alterado futuramente
sem impacto na estrutura do banco de dados.

A próxima revisão prevista é calculada como:

```
proxima_revisao_prevista = km_da_ultima_revisao + 10000
```

---

## 6. Margem para identificar uma revisão próxima

Uma margem de **1.000 km** antes do limite é usada para classificar uma revisão
como `PROXIMA`. Quando a quilometragem atual do veículo está dentro dessa
margem do próximo limite, o veículo é considerado "próximo da revisão".

---

## 7. Significado de cada situação de revisão

| Situação   | Significado                                                                 |
|------------|-----------------------------------------------------------------------------|
| `SEM_HISTORICO` | O veículo ainda não possui nenhuma revisão registrada. É necessário       |
|            | realizar uma avaliação inicial para estabelecer a referência de manutenção. |
| `EM_DIA`       | O veículo ainda não atingiu o intervalo previsto para a próxima revisão.   |
| `PROXIMA`      | O veículo está próximo de atingir o limite (dentro da margem de 1.000 km). |
| `PENDENTE`     | O veículo atingiu ou ultrapassou a quilometragem prevista e precisa de      |
|            | revisão.                                                                    |

---

## 8. Como o sistema identifica que um veículo precisa de manutenção

O serviço `verificarRevisaoPeriodica(carroId)` calcula a situação da seguinte
forma:

1. Se o veículo não possui revisão registrada → `SEM_HISTORICO`.
2. Caso contrário, calcula `proxima_revisao_prevista = ultima_revisao.km + 10000`.
3. Se `quilometragem_atual >= proxima_revisao_prevista` → `PENDENTE`.
4. Se `quilometragem_atual >= proxima_revisao_prevista - 1000` → `PROXIMA`.
5. Caso contrário → `EM_DIA`.

Quando a situação é `PENDENTE`, o veículo precisa de manutenção. Isso pode ser
usado para sinalizar que o veículo deve ser levado ao departamento de
manutenção.

---

## 9. Como funciona a integração com o status do veículo

A entidade `Carro` possui o atributo `quilometragem` (odômetro), que é
atualizado sempre que uma revisão é registrada. O status do veículo
(`StatusVeiculo`) já possui o valor `MANUTENCAO = 'em manutenção'`, que pode
ser usado para sinalizar que o veículo precisa de manutenção.

**Importante:** a implementação **não altera automaticamente** o status do
carro para `EM_MANUTENCAO` quando a revisão fica `PENDENTE`. Atingir o
intervalo de revisão não significa que a manutenção já foi iniciada ou
concluída. A alteração de status deve ser feita explicitamente pelo fluxo
operacional, respeitando as regras existentes (por exemplo, um veículo
`ALUGADO` não pode ser movido para `MANUTENCAO` enquanto estiver locado).

Após o registro de uma revisão concluída, a situação do veículo é recalculada
usando a nova quilometragem registrada.

O veículo não volta automaticamente para `DISPONIVEL` se ainda possuir
pendências de manutenção ou outras restrições.

---

## 10. Exemplos práticos de aplicação das regras

### Exemplo 1 — Veículo em dia (EM_DIA)

- Última revisão registrada: 10.000 km
- Próxima revisão prevista: 20.000 km
- Quilometragem atual do veículo: 17.000 km
- Margem: 1.000 km → limite para `PROXIMA` = 19.000 km
- Como 17.000 < 19.000, a situação é **EM_DIA**.

### Exemplo 2 — Veículo próximo da revisão (PROXIMA)

- Última revisão registrada: 10.000 km
- Próxima revisão prevista: 20.000 km
- Quilometragem atual do veículo: 19.200 km
- Limite para `PROXIMA` = 19.000 km
- Como 19.200 >= 19.000 e 19.200 < 20.000, a situação é **PROXIMA**.

### Exemplo 3 — Veículo com revisão pendente (PENDENTE)

- Última revisão registrada: 10.000 km
- Próxima revisão prevista: 20.000 km
- Quilometragem atual do veículo: 20.500 km
- Como 20.500 >= 20.000, a situação é **PENDENTE**.

### Exemplo 4 — Veículo sem histórico (SEM_HISTORICO)

- O veículo não possui nenhuma revisão registrada.
- A situação é **SEM_HISTORICO**. É necessário realizar uma avaliação inicial
  para estabelecer a referência de manutenção.

---

## Resumo das regras implementadas

1. Uma revisão pertence a exatamente um veículo (`carro_id` → `cars.id`).
2. Um veículo pode possuir várias revisões (coleção inversa `Carro.revisoes`).
3. Ao registrar uma revisão, verifica-se se o veículo existe.
4. A quilometragem da nova revisão não pode ser inferior à da última revisão
   do mesmo veículo.
5. A quilometragem atual do veículo (`Carro.quilometragem`) é atualizada com
   o `km` informado na revisão.
6. Revisão e atualização do veículo são persistidos na mesma transação.
7. `km` e `carroId` são imutáveis após o registro da revisão.
8. Apenas `descricao`, `valor` e `data` podem ser atualizados via `PATCH`.
9. O intervalo de revisão periódica é de 10.000 km.
10. A margem para classificação `PROXIMA` é de 1.000 km antes do limite.
11. As situações possíveis são: `SEM_HISTORICO`, `EM_DIA`, `PROXIMA`, `PENDENTE`.
12. Veículos sem revisão registrada são classificados como `SEM_HISTORICO`.
13. O status do veículo não é alterado automaticamente com base na revisão
    periódica.

---
