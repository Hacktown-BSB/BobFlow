---
name: ci-cd
description: >
  Use when the user asks for pipelines, continuous integration, deployment, release strategy,
  rollback, environment promotion, automation, or delivery flow.
  Gatilhos: CI/CD, pipeline, deploy, release, integração contínua, entrega contínua,
  automação, rollback, ambiente.
---

# CI/CD

## Propósito

Ajuda o Bob a estabelecer entrega rápida e segura, com tempo de feedback e controle de risco.

## Quando usar

- definir pipeline de build e testes;
- automatizar deploy em ambientes;
- discutir estratégia de release;
- planejar rollback e recuperação;
- preparar handoff e validação do time.

## Saída esperada

- pipeline sugerido;
- gates de qualidade;
- fluxo de deploy por ambiente;
- estratégia de rollback;
- critérios de aprovação.

## Prompt útil

> Projete um fluxo de CI/CD para esta solução. Defina build, testes, promoção entre ambientes, validações críticas e estratégia de rollback. Foque em velocidade, segurança e confiabilidade sem exagerar na complexidade.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [GitHub Actions docs](https://docs.github.com/en/actions) | pipelines modernos e automações |
| [GitLab CI/CD docs](https://docs.gitlab.com/ee/ci/) | deployment workflows e stages |
| [Google Cloud Deployment docs](https://cloud.google.com/architecture/devops) | práticas de entrega e release |

## Do / Don't

| Do | Don't |
|---|---|
| promover por etapas com segurança | fazer deploy direto sem gate |
| automatizar o que reduz risco real | automatizar tudo sem necessidade |
| incluir rollback como parte do design | considerar release sem recuperação |

## Checklist

- build e testes automáticos;
- ambiente de produção protegido;
- rollback planejado;
- promoção clara entre ambientes;
- qualidade e segurança no pipeline.
