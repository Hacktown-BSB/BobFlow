# Setup do IBM Bob IDE

Este guia prepara o IBM Bob IDE para trabalhar neste repositório e explica
como repetir o setup em outro computador.

## Requisitos

Segundo a [documentação oficial de instalação](https://bob.ibm.com/docs/ide/getting-started/install):

- macOS, Linux ou Windows;
- pelo menos 4 GB de RAM (8 GB recomendados);
- pelo menos 500 MB livres;
- conexão ativa com a internet;
- uma conta IBMid para entrar no IDE.

O IBM Bob IDE é um editor próprio baseado em VS Code. Ele não é uma extensão
do VS Code e não deve ser confundido com `bob-nvim`, o gerenciador de versões
do Neovim que também pode instalar um comando chamado `bob`.

## Instalação

1. Abra [bob.ibm.com/download](https://bob.ibm.com/download) e entre com seu
   IBMid, se solicitado.
2. Baixe o instalador correspondente ao sistema operacional:
   - macOS: `.pkg` (Apple Silicon ou Intel);
   - Windows: `.exe`;
   - Linux Debian/Ubuntu: `.deb` amd64;
   - Linux Red Hat/Fedora: `.rpm` x64.
3. Execute o instalador e aceite as opções padrão.
4. Abra **IBM Bob** pelo menu de aplicativos. Na primeira execução, faça login
   com o IBMid e conclua a configuração inicial.

### Arch Linux

O site oficial publica instaladores `.deb` e `.rpm`, não um pacote Arch. Por
isso, o caminho suportado é usar uma distribuição Debian/Ubuntu ou Fedora/RHEL
para instalar o IDE. Evite instalar o `.deb` diretamente no Arch: isso pode
deixar dependências e atualizações fora do gerenciador de pacotes do sistema.

O VS Code já instalado neste computador continua utilizável, mas ele não
executa o IBM Bob. Use o botão **Download** do site oficial para obter o
instalador adequado ao sistema escolhido.

Neste notebook, o pacote `.deb` foi extraído em modo local, sem instalar
arquivos do sistema:

```text
~/.local/share/bobide/
~/.local/share/applications/bobide.desktop
```

O arquivo `.desktop` é o que faz **IBM Bob** aparecer no menu do Omarchy. Essa
é uma adaptação local e não substitui um pacote Arch oficial; atualizações
devem ser feitas baixando uma nova versão no site da IBM e repetindo a
extração.

## Abrir este projeto no Bob

No IBM Bob, escolha **File > Open Folder** e selecione a pasta raiz do clone:

```text
IBM_Dev_Day_Hackathon/
```

Abra o terminal integrado e execute:

```bash
bash scripts/setup-bob-hackathon.sh
```

O script cria o contexto local em `~/.bob/settings/` e mantém os materiais
versionados do projeto em `bob/`. Depois, comece por
`bob/brain-map.md`, `bob/context/mission-brief.md` e
`bob/context/prompt-template.md`.

## Configuração de MCPs, skills e plugins

Os catálogos deste repositório são referências para configurar o Bob:

- [bob/mcp/README.md](bob/mcp/README.md): MCPs recomendados;
- [bob/skills/README.md](bob/skills/README.md): skills disponíveis;
- [bob/plugins/README.md](bob/plugins/README.md): plugins e seus objetivos.

Habilite somente servidores MCP necessários para a tarefa e revise permissões
antes de permitir acesso a arquivos, shell, banco de dados ou GitHub.

## Repetir em outro computador

1. Instale o IBM Bob IDE conforme a seção **Instalação**.
2. Instale Git e clone o repositório:

   ```bash
   git clone https://github.com/Hacktown-BSB/IBM_Dev_Day_Hackathon.git
   cd IBM_Dev_Day_Hackathon
   ```

3. Abra a pasta no IBM Bob.
4. Execute `bash scripts/setup-bob-hackathon.sh`.
5. Entre no IBM Bob com o IBMid de cada pessoa e configure os MCPs que ela
   realmente precisará.
6. Confirme que o contexto foi criado:

   ```bash
   test -f ~/.bob/settings/hackathon-context.md
   ```

Não versione `~/.bob/settings/`, tokens, chaves de API ou credenciais. O
repositório contém apenas contexto e catálogos compartilháveis.

## Diagnóstico rápido

- `bob --version` mostrar `bob-nvim`: isso não é o IBM Bob IDE; abra o IDE pelo
  menu de aplicativos ou use o instalador oficial.
- O login falhar: confirme a conexão, o IBMid e o acesso ao serviço IBM Bob.
- O script não executar: verifique se está na raiz do repositório e rode
  `bash scripts/setup-bob-hackathon.sh`.
