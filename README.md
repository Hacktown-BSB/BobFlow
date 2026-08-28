# IBM Dev Day Hackathon — Bob operating kit

Kit pronto para preparar o ambiente do Bob para um hackathon de 2 dias com foco em resolver problemas reais para engenharia de software.

## Objetivo

- reduzir ruído de contexto e custo de token;
- deixar prompts, skills, plugins e MCPs organizados;
- manter fluxo de descoberta, arquitetura, implementação, validação e pitch em ordem;
- apoiar criação de soluções úteis para profissionais de software.

## Estrutura

- [bob/brain-map.md](bob/brain-map.md): mapa mental e fluxo de trabalho do Bob;
- [bob/skills](bob/skills): catálogo por área de TI com skills especializadas para arquitetura, dados, segurança, DevOps e IA;
- [bob/skills/index.md](bob/skills/index.md): guia de descoberta para escolher a skill certa;
- [bob/plugins](bob/plugins): plugins de arquitetura, validação e geração de proposta;
- [bob/mcp](bob/mcp): lista de MCPs úteis para código, dados, execução e pesquisa;
- [scripts/setup-bob-hackathon.sh](scripts/setup-bob-hackathon.sh): bootstrap do ambiente local.

## Setup rápido

O IBM Bob é um editor baseado em VS Code e é instalado separadamente do VS Code.
Consulte [SETUP.md](SETUP.md) para instalar o IDE, fazer login e abrir este
repositório. O comando `bob` pode ser outro programa (por exemplo, bob-nvim) e
não identifica o IBM Bob IDE.

1. Rode o bootstrap do contexto do hackathon:
   `bash scripts/setup-bob-hackathon.sh`
2. Comece pelo mapa mental em [bob/brain-map.md](bob/brain-map.md).
3. Use as skills e plugins conforme a fase do hackathon.

## Foco de solução

O objetivo principal é criar uma solução favorável ao engenheiro de software, com uso prático em:

- produtividade de desenvolvimento;
- qualidade de código e arquitetura;
- automação de tarefas repetitivas;
- observabilidade, monitoramento e debugging;
- onboarding, documentação e escolhas técnicas;
- suporte a dados, IA, segurança e entrega contínua.

## Como o Bob escolhe a skill certa

O Bob deve seguir este fluxo:

1. entender o problema principal;
2. classificar a área do problema (arquitetura, API, dados, segurança, DevOps, IA);
3. selecionar a skill mais específica;
4. solicitar resposta com estrutura, riscos e trade-offs;
5. manter contexto mínimo e reutilização entre etapas.

Isso reduz custo de token e melhora a qualidade da resposta.

## Regras de uso do Bob no hackathon

- mantenha cada prompt com objetivo único;
- passe contexto mínimo necessário para o problema;
- prefira perguntas e tarefas em blocos: descoberta, arquitetura, código, validação, pitch;
- reserve o contexto rico para a fase de implementação;
- use o Bob para revisão e debate, não para substituir raciocínio crítico do time.

## Mapa mental recomendado

A primeira tarefa do time deve ser transformar a ideia em um problema bem definido, em seguida gerar arquitetura, protótipo e prova de valor.

A sequência sugerida é:

1. Problema e público;
2. Requisitos e critérios de sucesso;
3. Arquitetura de alto nível;
4. Prototipação rápida;
5. Validação com casos reais;
6. Pitch e demo.

## Próximo passo

Abra [bob/brain-map.md](bob/brain-map.md) e comece pela seção de "primeira janela do Bob" para estruturar o contexto antes da primeira iteração.
