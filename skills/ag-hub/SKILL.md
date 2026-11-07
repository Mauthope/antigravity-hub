---
name: ag-hub
description: Gerenciador universal de agentes, skills e MCP para o Antigravity com verificação estrita de licenças MIT/Apache-2.0 e invocação direta no chat. Use quando o usuário pedir para instalar skills do GitHub, criar agentes ou conectar servidores MCP.
---

# Antigravity Hub (`ag-hub`)

Esta habilidade permite gerenciar agentes, importar habilidades do GitHub com auditoria rigorosa de licenças (0% risco legal) e conectar servidores MCP e APIs REST ao Antigravity.

## Capacidades

1. **Importar Skills do GitHub**:
   - Sempre audita a licença do repositório/código antes de qualquer instalação.
   - **Permitido apenas**: `MIT` e `Apache-2.0`.
   - Bloqueia GPL, AGPL, proprietário ou código sem licença explícita.
   - Execução:
     ```bash
     ag-hub skill add <URL_DO_GITHUB> [--global]
     ```

2. **Criar e Registrar Agentes para o Chat**:
   - Cria o agente e automaticamente gera a skill global em `~/.gemini/config/skills/<nome>/SKILL.md`.
   - Permite que o usuário acione o agente em **qualquer projeto** digitando `/<nome>` no chat.
   - Execução:
     ```bash
     ag-hub agent create <nome> --role "<papel>" --prompt "<prompt_de_sistema>" [--mcp <mcp_servers...>]
     ```

3. **Listar Agentes e Skills**:
   ```bash
   ag-hub agent list
   ag-hub skill list
   ```

4. **Conectar Servidores MCP**:
   - Presets oficiais (1 comando):
     ```bash
     ag-hub mcp preset fetch
     ag-hub mcp preset sqlite --db ./dados.sqlite
     ag-hub mcp preset postgres --conn postgresql://localhost/db
     ag-hub mcp preset github --token <token>
     ag-hub mcp preset filesystem --dir .
     ```
   - Servidor customizado:
     ```bash
     ag-hub mcp add <nome> --command <cmd> --args <args...>
     ```

5. **Conectar APIs REST**:
   ```bash
   ag-hub api-connect <nome> --url <base_url> [--header <header>] [--token <token>]
   ```

## Diretrizes para o Agente
- Ao receber um pedido como *"instale a skill do GitHub https://..."*, execute `ag-hub skill add <url>` e informe o resultado da auditoria de licença e os comandos de uso da skill.
- Ao receber *"crie um agente para..."*, execute `ag-hub agent create` e informe que o usuário já pode ativá-lo digitando `/<nome>` no chat.
