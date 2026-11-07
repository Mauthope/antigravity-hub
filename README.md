# ⚡ Antigravity Hub (`ag-hub`)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMauthope%2Fantigravity-hub)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)
[![Node: 22+](https://img.shields.io/badge/Node.js-22%2B-blue.svg)](https://nodejs.org)
[![Legal Compliance](https://img.shields.io/badge/Legal%20Risk-0%25%20(MIT%20%7C%20Apache--2.0)-green.svg)](#-politica-de-auditoria-de-licencas-0-risco-juridico)

> **Gerenciador universal de agentes, skills e MCP para o Google Antigravity.**
> Permite criar, padronizar, salvar e invocar seus agentes no chat em qualquer projeto, importar skills do GitHub com verificação estrita de licenças e conectar servidores MCP.

---

## 🌟 Principais Funcionalidades

1. **Acesse seus Agentes no Chat em Qualquer Projeto**:
   - Cada agente criado é automaticamente registrado globalmente em `~/.gemini/config/skills/<nome>/SKILL.md`.
   - Basta digitar no chat: `/<nome-do-agente>` (ex: `/code-reviewer`) ou *"chame o agente <nome>"*.
2. **Importação Universal do GitHub com Auditoria de Licenças (0% Risco Legal)**:
   - Cole qualquer link do GitHub (repositório, pasta, arquivo `SKILL.md` ou Gist).
   - O sistema audita a licença antes de baixar. Apenas **MIT** e **Apache-2.0** são permitidas. Repositórios com GPL, Copyleft ou sem licença explícita são sumariamente bloqueados.
3. **Conectores MCP e APIs REST**:
   - Presets prontos com 1 comando: `sqlite`, `fetch`, `github`, `postgres`, `filesystem`.
   - Conexão de APIs REST gerando tanto a entrada MCP quanto scripts cURL executáveis.
4. **Deploy no Vercel em 1 Clique**:
   - Dashboard web em tempo real com serverless functions para consultar licenças e gerenciar agentes de qualquer dispositivo.

---

## 🚀 Deploy no Vercel

Você pode hospedar o dashboard web do Antigravity Hub gratuitamente no Vercel com 1 clique:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMauthope%2Fantigravity-hub)

Ou importe manualmente no painel da Vercel:
1. Acesse [vercel.com/new](https://vercel.com/new)
2. Selecione o repositório `Mauthope/antigravity-hub`
3. Clique em **Deploy**.

---

## 💻 Instalação e Uso Local

### 1. Clonar e Instalar Dependências
```bash
git clone https://github.com/Mauthope/antigravity-hub.git
cd antigravity-hub
npm install
npm run build
```

### 2. Comandos Principais do CLI

```bash
# Inicializar o padrão .agents/ no seu projeto atual
ag-hub init

# Importar uma skill do GitHub (com verificação estrita de licença)
ag-hub skill add https://github.com/expressjs/express --global

# Criar um novo agente e habilitá-lo imediatamente para o chat
ag-hub agent create reviewer --role "Senior Code Reviewer" --prompt "Diretrizes de revisão..."

# Listar agentes disponíveis para o chat
ag-hub agent list

# Conectar servidores MCP
ag-hub mcp preset sqlite --db ./dados.sqlite
ag-hub mcp preset fetch

# Conectar uma API REST externa
ag-hub api-connect stripe --url https://api.stripe.com/v1 --header "Authorization" --token "Bearer sk_..."
```

---

## 🛡️ Política de Auditoria de Licenças (0% Risco Jurídico)

O `ag-hub` protege seu código e seus projetos contra riscos de contaminação por licenças virais (Copyleft) ou violação de direitos autorais:
- **Licenças Autorizadas**: `MIT` e `Apache-2.0`.
- **Licenças Bloqueadas**: `GPL`, `AGPL`, `LGPL`, `BSL`, `CC-BY-NC`, proprietárias ou projetos sem licença explícita (onde todos os direitos são reservados por padrão).

---

## 🧪 Testes Automatizados

O projeto conta com suíte completa de testes unitários:

```bash
npm test
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE) para mais informações.
