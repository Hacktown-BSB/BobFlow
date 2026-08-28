# Mapa cerebral do Bob para o hackathon

## Visão geral

Este mapa foi desenhado para reduzir ruído e aumentar a eficiência de token durante os 2 dias do hackathon. Ele organiza a atuação do Bob em blocos bem definidos: problema, arquitetura, implementação, validação e pitch.

## 1. Primeiro bloco: contexto e framing

Objetivo: transformar ideia vaga em problema claro.

### Conteúdo essencial
- público-alvo;
- dor do usuário;
- cenário atual;
- ganho esperado;
- limites do projeto;
- definição de sucesso.

### Prompt recomendado
> Atue como partner de engenharia de software em hackathon. Entenda este problema, identifique a dor real, classifique o usuário e proponha uma hipótese de solução. Responda com: problema, público, necessidade, critério de sucesso, restrições e perguntas críticas.

## 2. Segundo bloco: requisitos e decisão

Objetivo: remover ambiguidade antes da escrita de código.

### Checklist
- requisitos funcionais;
- requisitos não funcionais;
- trade-offs;
- regras de negócio;
- dependências externas;
- risco de entrega.

### Prompt recomendado
> Liste requisitos, priorize os essenciais, identifique riscos e trade-offs. Dê uma visão de produto e técnica sem escrever código ainda. Considere tempo de hackathon, viabilidade e prova de valor.

## 3. Terceiro bloco: arquitetura

Objetivo: manter a solução simples e executável.

### Estrutura sugerida
- camada de interface;
- camada de serviços/lógica;
- camada de dados/integração;
- observabilidade;
- testes de validação.

### Prompt recomendado
> Proponha uma arquitetura de alto nível para um protótipo em 48h. Use a menor complexidade possível que ainda entrega valor. Descreva componentes, fluxos, dependências e decisões de design.

## 4. Quarto bloco: implementação

Objetivo: transformar arquitetura em código útil.

### Regra prática
- um prompt por objetivo;
- uma tarefa por iteração;
- validar em pequenas unidades;
- não pedir solução completa em um único bloco.

### Prompt recomendado
> Implemente a funcionalidade X com foco em robustez, legibilidade e rapidez. Explicite as premissas, gere código funcional e destaque áreas que podem ser melhoradas em próxima iteração.

## 5. Quinto bloco: revisão e debug

Objetivo: reduzir retrabalho e erros de inferência.

### Checklist
- assessoria de código;
- segurança e validação;
- edge cases;
- performance;
- motivo de falha;
- correção mínima necessária.

### Prompt recomendado
> Revise este trecho com foco em correção, clareza e risco. Liste falhas, edge cases e recomendações de melhoria. Se houver bug, proponha diagnóstico e correção.

## 6. Sexto bloco: validação e demo

Objetivo: provar que a solução atende ao problema.

### Checklist
- cenário real;
- dado input e output;
- prove o que mudou;
- métricas simples;
- story da demo.

### Prompt recomendado
> Crie uma validação objetiva para a solução, com cenários de uso, critérios de sucesso e roteiro de demo. Enfatize o valor percebido pelo usuário e o impacto técnico da proposta.

## 7. Sétimo bloco: pitch

Objetivo: vender a ideia de forma clara.

### Estrutura
- problema;
- solução;
- impacto;
- diferencial;
- demo script;
- próximos passos.

### Prompt recomendado
> Transforme a solução em um pitch curto e convincente para jurados e stakeholders. Use linguagem clara, foco em impacto e mantenha estrutura de 1 minuto para demo e 3 minutos para explicação.

## Princípios de economia de token

- separar tarefa por domínio: produto, arquitetura, código, validação, pitch;
- anexar somente o contexto necessário;
- exigir saídas estruturadas;
- usar resumos ao invés de repassar arquivos inteiros;
- pedir trade-offs e riscos, não apenas solução;
- usar poucas rodadas por decisão crítica.

## Fluxo recomendado para os 2 dias

### Dia 1
- descoberta e framing;
- requisitos e arquitetura;
- prototype inicial.

### Dia 2
- melhorar robustez e validadores;
- revisão e demo;
- polish de pitch e apresentação.

## Checklist final do time

- problema bem definido;
- usuário claro;
- arquitetura simples;
- solução testada;
- impacto demonstrado;
- pitch pronto.
