---
name: observability
description: >
  Use when the user asks for logs, metrics, traces, monitoring, SLOs, dashboards,
  debugging, incidents, or visibility into system health.
  Gatilhos: observabilidade, logs, métricas, traces, SLI, SLO, monitoramento,
  debugging, telemetria, dashboard.
---

# Observability

## Propósito

Ajuda o Bob a tornar a solução rastreável e diagnóstica, com foco em sinais úteis em produção ou em demo.

## Quando usar

- definir logs e métricas;
- preparar monitoramento e alertas;
- discutir SLI/SLO;
- depurar falhas e latência;
- decidir o que é observável e por quê.

## Saída esperada

- sinais-chave de saúde;
- sensores e dashboards;
- regras de alerta;
- estratégia de troubleshooting;
- indicadores de sucesso operacional.

## Prompt útil

> Projete a observabilidade desta solução. Defina métricas, eventos de log, traces e painéis essenciais para detectar falhas, regressão de desempenho e comportamento do usuário. Inclua SLOs simples e estratégia de alerta.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [OpenTelemetry](https://opentelemetry.io/) | trace, metrics e logs padronizados |
| [Google SRE Book](https://sre.google/sre-book/table-of-contents/) | SLI/SLO e confiabilidade |
| [Prometheus](https://prometheus.io/docs/introduction/overview/) | coleta e alertas de métricas |

## Do / Don't

| Do | Don't |
|---|---|
| priorizar métricas de negócio e infra | logar tudo sem filtro |
| definir dashboard focado em decisão | criar painel ornamental |
| desenhar alertas com severidade | alertar para ruído constante |

## Checklist

- indicadores críticos definidos;
- logs úteis e sem excesso;
- alertas com significado;
- diagnósticos rápidos;
- SLI/SLO ou equivalente.
