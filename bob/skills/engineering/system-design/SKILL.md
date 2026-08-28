---
name: system-design
description: >
  Use when the user asks for system scaling, capacity planning, distributed systems,
  load, cache, queues, consistency, latency, or architecture for growth.
  Gatilhos: design de sistema, escalabilidade, alta disponibilidade, sharding, fila,
  cache, performance, throughput.
---

# System Design

## Propósito

Ajuda o Bob a desenhar sistemas que suportem volume, resiliência e crescimento sem complexidade excessiva.

## Quando usar

- projetar fluxo de dados e carga;
- avaliar escalabilidade e limites;
- escolher cache, fila, banco ou APIs;
- estimar capacidade e latência;
- decidir entre consistência forte ou eventual.

## Saída esperada

- requisitos de escala;
- componentes do sistema;
- fluxos principais;
- estimativas de carga e latência;
- falhas e mitigação;
- arquitetura final com justificativa.

## Prompt útil

> Desenhe um sistema para este caso de uso, considerando volume esperado, latência, resiliência e custo. Defina componentes, fluxos, armazenamento, filas, cache e trade-offs de consistência.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [System Design Primer](https://github.com/donnemartin/system-design-primer) | conceitos de escalabilidade e arquitetura distribuída |
| [AWS Architecture Center](https://aws.amazon.com/architecture/) | padrões reais e recomendações |
| [Google Cloud Architecture](https://cloud.google.com/architecture) | boas práticas de sistemas e dados |

## Do / Don't

| Do | Don't |
|---|---|
| definir assumptions e estimativas | inventar números sem base |
| separar requisitos funcional e não funcional | misturar escala com feature |
| contemplar falhas | ignorar disponibilidade |

## Checklist

- carga estimada;
- component boundaries claros;
- fluxo de dados definido;
- cache/queue/banco justificados;
- riscos e mitigação.
