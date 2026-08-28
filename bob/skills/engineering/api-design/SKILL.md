---
name: api-design
description: >
  Use when the user asks for REST APIs, GraphQL, schema, versioning, contracts,
  pagination, authentication, or backend interface design.
  Gatilhos: API, contrato, REST, GraphQL, endpoint, versionamento, payload,
  pagination, documentação.
---

# API Design

## Propósito

Ajuda o Bob a modelar interfaces entre serviços, frontend e dados com clareza e baixo atrito.

## Quando usar

- desenhar endpoints;
- definir contratos de entrada e saída;
- decidir versionamento e erro;
- criar API para produto ou microservice;
- padronizar autenticação e consistência.

## Saída esperada

- endpoints e métodos;
- payload e resposta;
- erros e status codes;
- autenticação e autorização;
- limites e versionamento.

## Prompt útil

> Projete uma API para este caso de uso. Defina endpoints, payloads, autenticação, versionamento, paginação, padrões de erro e consistência contratual. Avalie trade-offs entre REST e GraphQL quando adequado.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [OpenAPI Specification](https://www.openapis.org/) | contrato formal e documentação de API |
| [Postman Learning Center](https://learning.postman.com/) | boas práticas de API e testes |
| [Stripe API Design](https://stripe.com/docs/api) | clareza, consistência e ergonomia de API |

## Do / Don't

| Do | Don't |
|---|---|
| fazer contrato simples e previsível | over-engineer payloads |
| documentar erros reais | usar mensagem genérica sem contexto |
| pensar em versionamento cedo | esquecer compatibilidade |

## Checklist

- contrato estável;
- erros padronizados;
- autenticação definida;
- documentação mínima clara;
- versionamento consistente.
