---
name: architecture
description: >
  Use when the user asks for software architecture, design decisions, ADR, modularization,
  service boundaries, stack choice, or technical trade-offs.
  Gatilhos: arquitetura, design de software, estrutura de app, decisão técnica,
  modularização, stack, trade-offs, service boundaries.
---

# Architecture

## Propósito

Ajuda o Bob a decidir a melhor estrutura técnica para uma solução com foco em clareza, manutenibilidade e velocidade de entrega.

## Quando usar

- definir a base da solução;
- escolher entre monólito, microsserviços, módulos, serviços ou componentes;
- decidir sobre camadas, contratos e dependências;
- produzir ADR ou resumo de decisão técnica;
- analisar trade-offs com tempo de hackathon.

## Saída esperada

- problema e restrição;
- opções viáveis;
- arquitetura recomendada;
- trade-offs e riscos;
- plano de implementação em etapas;
- critérios de sucesso.

## Prompt útil

> Proponha uma arquitetura de software para este problema. Considere restrições de tempo, custo, segurança, escalabilidade e manutenibilidade. Compare opções, escolha a mais apropriada e explique trade-offs, riscos e próximos passos.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/framework/) | princípios de arquitetura, resiliência e segurança |
| [Google Cloud Architecture Center](https://cloud.google.com/architecture) | padrões de sistemas distribuídos e design |
| [Martin Fowler — Architecture](https://martinfowler.com/architecture/) | visão de arquitetura e decisões de design |

## Do / Don't

| Do | Don't |
|---|---|
| priorizar simplicidade com valor real | criar arquitetura complexa sem necessidade |
| justificar cada decisão | entregar solução sem trade-off |
| alinhar com restrição do hackathon | ignorar tempo e escopo |

## Checklist

- problema bem definido;
- opções comparadas;
- arquitetura simples o suficiente para entregar;
- riscos explicitados;
- evidência de viabilidade.
