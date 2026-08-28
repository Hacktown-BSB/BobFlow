---
name: ai-agent-patterns
description: >
  Use when the user asks for AI agents, multi-agent orchestration, prompting patterns,
  tool use, workflow decomposition, memory, guardrails, or agentic system design.
  Gatilhos: agente de IA, arquitetura de agentes, orquestração, prompt engineering,
  tools, memory, guardrails, workflow de IA.
---

# AI Agent Patterns

## Propósito

Ajuda o Bob a raciocinar em sistemas de IA com estrutura, guardrails e separação de responsabilidade.

## Quando usar

- criar ou avaliar agentes de IA;
- decompor tarefas em etapas;
- decidir sobre memory, tool calling e orquestração;
- melhorar qualidade e custo do fluxo de IA;
- definir guardrails e contexto mínimo.

## Saída esperada

- objetivo do agente;
- arquitetura do workflow;
- tools e contexto necessários;
- guardrails e gestão de erro;
- critérios de qualidade e monitoramento.

## Prompt útil

> Projete um agente de IA para este caso de uso. Defina objetivo, context windows, tool use, roteamento, memória e guardrails. Explique como o agente reduz custo de token, melhora confiabilidade e entrega valor para o usuário sem perder controle humano.

## Recursos de referência

| Recurso | O que pegar |
|---|---|
| [OpenAI Agents docs](https://platform.openai.com/docs/concepts/agents) | arquitetura de agentes, tool use e loops |
| [Anthropic prompt engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) | criação de prompts e orquestração eficaz |
| [LangChain docs](https://python.langchain.com/docs/) | padrões de workflow e agentes |

## Do / Don't

| Do | Don't |
|---|---|
| dividir em passos verificáveis | exigir um agente para tudo |
| manter contexto mínimo e objetivo claro | empilhar contexto irrelevante |
| usar tool calling com guardrails | confiar em IA para decisões críticas sem validação |

## Checklist

- objetivo do agente definido;
- ferramentas e limites claros;
- guardrails e fallback documentados;
- custo de token entendido;
- validação humana e observabilidade presentes.
