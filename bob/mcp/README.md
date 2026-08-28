# MCPs úteis para o Bob

MCPs ajudam a ampliar o contexto e o poder de execução do agente, sem depender de prompts desnecessários.

## Recomendações gerais
- GitHub: rastrear tarefas, issues e PRs;
- filesystem: acessar arquivos e contexto local;
- browser/search: descobrir informação externa e documentação;
- database: consultar dados reais e validar cenário;
- shell: executar testes e validações locais;
- docs: consultar manuais e referências técnicas;
- API/OpenAPI: confirmar contrato de integração.

## Stack ideal para hackathon

1. filesystem
2. GitHub
3. browser/search
4. shell
5. database
6. docs reference

## Exemplo de configuração conceitual

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["@modelcontextprotocol/server-filesystem"] },
    "github": { "command": "npx", "args": ["@modelcontextprotocol/server-github"] },
    "sqlite": { "command": "npx", "args": ["@modelcontextprotocol/server-sqlite"] },
    "browser": { "command": "npx", "args": ["@modelcontextprotocol/server-chrome"] },
    "shell": { "command": "npx", "args": ["@modelcontextprotocol/server-shell"] }
  }
}
```

## Critério de seleção
Quanto mais a ferramenta:
- reduzir necessidade de cola manual de dados;
- melhorar rastreabilidade da decisão;
- permitir validação real de dados e execução;
- manter o contexto organizado;
melhor.
