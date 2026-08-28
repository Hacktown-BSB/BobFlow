#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOB_DIR="$REPO_ROOT/bob"
HOME_BOB_DIR="$HOME/.bob"
SETTINGS_DIR="$HOME_BOB_DIR/settings"

mkdir -p "$BOB_DIR/skills" "$BOB_DIR/plugins" "$BOB_DIR/mcp" "$BOB_DIR/context" "$SETTINGS_DIR"

cat > "$HOME_BOB_DIR/settings/hackathon-context.md" <<'EOF'
# Bob Hackathon — contexto operacional

## Objetivo do time
Resolver um problema real para engenharia de software em 2 dias, com foco em prova de valor, arquitetura e pitch.

## Mapa mental recomendando para o Bob
1. Entender o problema e o usuário.
2. Definir requisitos e restrições.
3. Propor arquitetura em 2 ou 3 camadas.
4. Validar assumptions e riscos.
5. Implementar protótipo mínimo.
6. Medir impacto e preparar demo.

## Regras de produtividade
- Um objetivo por prompt.
- Contexto mínimo, porém suficiente.
- Solicitar arquitetura, revisão, código e validação em blocos separados.
- Sempre pedir trade-offs e riscos.
- Não usar o Bob para escrever código sem validação humana.

## Skills recomendadas
- engenharia de software
- arquitetura de produto
- prototipagem rápida
- debugging e revisão
- pitch e demo

## MCPs úteis
- GitHub
- filesystem
- browser/search
- database
- shell
- docs/knowledge

## Prompt starter
> Atue como um parceiro de engenharia de software em hackathon. Entenda o problema, proponha arquitetura clara, gere um protótipo funcional e identifique riscos antes da implementação. Responda em blocos: problema, requisitos, arquitetura, plano de implementação, validação e pitch.
EOF

cat > "$REPO_ROOT/bob/context/mission-brief.md" <<'EOF'
# Brief da missão

## Perfil da solução
A solução deve ajudá-lo(a) como engenheiro(a) de software a:
- ganhar tempo;
- reduzir ruído operacional;
- melhorar qualidade e robustez;
- automatizar fluxos repetitivos;
- entregar valor visível rapidamente.

## Critérios de qualidade
- resolve um problema real;
- tem promessa de impacto mensurável;
- prova de valor em demo curta;
- arquitetura simple, testável e sustentável;
- usa dados e contexto do mundo real.
EOF

cat > "$REPO_ROOT/bob/context/prompt-template.md" <<'EOF'
# Prompt template para o Bob

Contexto:
- Problema:
- Usuário:
- Objetivo:
- Restrição:
- Dados disponíveis:
- Entregável esperado:

Tarefa:
1. Defina o problema e proponha hipótese.
2. Liste requisitos funcionais e não funcionais.
3. Proponha arquitetura de alto nível.
4. Gere plano de implementação em etapas.
5. Descreva riscos, dependências e mitigação.
6. Sugerir validação e demo.

Formato de resposta:
- resumo executivo
- hipótese e problema
- proposta técnica
- plano de execução
- critérios de sucesso
- próximas perguntas
EOF

if command -v bob >/dev/null 2>&1; then
  echo "Comando 'bob' detectado: $(bob --version)"
  echo "Observação: confirme que este é o IBM Bob IDE; bob-nvim é um produto diferente."
else
  echo "IBM Bob IDE não foi detectado no PATH. Instale-o conforme SETUP.md."
fi

echo "Setup concluído."
echo "Diretórios criados: $BOB_DIR"
echo "Contexto local: $HOME_BOB_DIR/settings/hackathon-context.md"
echo "Próximo passo: leia $BOB_DIR/brain-map.md"
