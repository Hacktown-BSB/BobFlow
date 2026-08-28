---
name: testing
description: >
  Use when the user asks for testing strategy, unit tests, integration tests, QA,
  regression, test pyramid, or validation of software behavior.
  Gatilhos: testes automatizados, QA, regressão, unitário, integração, validação,
  cobertura, golden path.
---

# Testing

## Propósito

Ajuda o Bob a construir validação útil e econômica, focando no que realmente reduz risco.

## Quando usar

- escolher estratégia de testes para feature nova;
- diminuir regressões e falhas críticas;
- validar comportamento de ponta a ponta;
- definir testes em contexto de hackathon;
- priorizar testes por risco e impacto.

## Saída esperada

- objetivo do teste;
- tipo de teste e prioridade;
- casos de sucesso e falha;
- risco coberto;
- estratégia de execução rápida.

## Prompt útil

> Crie uma estratégia de testes para esta funcionalidade. Priorize o maior valor de segurança e confiabilidade, defina testes unitários, de integração e fluxos críticos e explique por que cada um importa.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [Google Testing Blog](https://testing.googleblog.com/) | estratégias de qualidade e confiabilidade |
| [Martin Fowler — Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) | equilíbrio entre testes rápidos e de alto nível |
| [Playwright docs](https://playwright.dev/docs/intro) | validação moderna de UI e end-to-end |

## Do / Don't

| Do | Don't |
|---|---|
| cobrir fluxo crítico e risco funcional | testar tudo sem priorizar |
| usar testes de borda e regressão | depender só de manual QA |
| manter feedback rápido | inserir suite lenta sem necessidade |

## Checklist

- risco identificado;
- casos principais definidos;
- testes rápidos e confiáveis;
- regressão coberta;
- critério de aceitação claro.
