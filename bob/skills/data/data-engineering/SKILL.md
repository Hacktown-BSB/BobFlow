---
name: data-engineering
description: >
  Use when the user asks for data pipelines, ETL/ELT, ingestion, quality, warehousing,
  transformation, analytics, or data lifecycle.
  Gatilhos: dados, pipeline, ETL, ELT, warehouse, analytics, qualidade de dados,
  ingestão, transformação.
---

# Data Engineering

## Propósito

Ajuda o Bob a organizar fluxos de dados confiáveis, consistentes e úteis para decisões e produto.

## Quando usar

- definir pipeline de dados ou integração;
- fazer ingestão e transformação;
- melhorar qualidade e rastreabilidade dos dados;
- decidir armazém, orquestração e processamento;
- conectar dados de produto com análise e tomada de decisão.

## Saída esperada

- fonte e destino dos dados;
- transformação e qualidade;
- schema e governança mínima;
- fluxo de ingestão e processamento;
- critérios de validação e monitoramento.

## Prompt útil

> Projete um pipeline de dados para este caso de uso. Defina fontes, transformações, qualidade, armazenamento e monitoramento. Foque em confiabilidade, rastreabilidade e valor para decisão ou produto.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [Apache Airflow docs](https://airflow.apache.org/docs/) | orquestração de pipelines |
| [dbt docs](https://docs.getdbt.com/) | transformação e modelagem em dados analíticos |
| [Google Data Engineering](https://cloud.google.com/learn/data-engineering) | boas práticas de dados e arquitetura |

## Do / Don't

| Do | Don't |
|---|---|
| validar qualidade e schema | assumir que o dado está correto |
| separar ingestão de transformação | misturar tudo sem rastreio |
| definir observabilidade do pipeline | ignorar falhas e reprocessamento |

## Checklist

- origem e destino claros;
- qualidade e schema revisados;
- falhas observáveis;
- fluxo reprocessável;
- valor de negócio ou técnico definido.
