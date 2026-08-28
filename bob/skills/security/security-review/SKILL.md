---
name: security-review
description: >
  Use when the user asks for security, OWASP, authN/authZ, secrets, hardening,
  vulnerabilities, threat modeling, or secure-by-default software design.
  Gatilhos: segurança, OWASP, vulnerabilidade, auth, autorização, credenciais,
  hardening, risco de segurança, threat model.
---

# Security Review

## Propósito

Ajuda o Bob a revisar risco de segurança e sugerir mitigação prática antes de entrega.

## Quando usar

- avaliar app, API ou fluxo de dados;
- verificar autenticação e autorização;
- revisar exposição de segredos e configuração;
- identificar vulnerabilidades comuns;
- definir hardening simples e eficaz.

## Saída esperada

- ativos em risco;
- vulnerabilidades identificadas;
- impacto e severidade;
- medidas corretivas;
- checklist de hardening.

## Prompt útil

> Revise esta solução com foco em segurança. Identifique riscos reais, vulnerabilidades de camada web e backend, e proponha mitigação priorizada para proteção de dados, autenticação, autorização e exposição de segredos.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | principais riscos de aplicação |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | checklist de segurança prática |
| [NIST Secure Software Development Framework](https://csrc.nist.gov/Projects/ssdf) | bons padrões de construção segura |

## Do / Don't

| Do | Don't |
|---|---|
| priorizar risco real e acoplamento | listar vulnerabilidades sem impacto |
| revisar configuração e segredos | assumir que infra já está segura |
| separar mitigação rápida e reforço estrutural | criar checklist infinito sem execução |

## Checklist

- autenticação e autorização claras;
- segredos minimizados;
- validação e encoding definidos;
- logging seguro;
- risco documentado e mitigado.
