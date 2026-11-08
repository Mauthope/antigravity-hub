import path from 'node:path';
import fs from 'node:fs';
import {
  McpConfigFile,
  McpServerDefinition,
  McpServerDefinitionSchema,
  HubPaths,
} from '../types/index.js';
import { resolveHubPaths, ensureDir } from '../utils/paths.js';

export interface McpPreset {
  name: string;
  description: string;
  type: 'stdio' | 'sse';
  defaultCommand?: string;
  defaultArgs?: string[];
  paramHelp?: string;
  generate: (params?: Record<string, string>) => McpServerDefinition;
}

export const MCP_PRESETS: Record<string, McpPreset> = {
  fetch: {
    name: 'fetch',
    description: 'Servidor MCP oficial para busca e conversão de páginas web em Markdown',
    type: 'stdio',
    defaultCommand: 'uvx',
    defaultArgs: ['mcp-server-fetch'],
    generate: () => ({
      command: 'uvx',
      args: ['mcp-server-fetch'],
      type: 'stdio',
      description: 'Fetch web content and convert to markdown',
    }),
  },
  sqlite: {
    name: 'sqlite',
    description: 'Conector MCP para banco de dados SQLite local',
    type: 'stdio',
    paramHelp: 'Caminho do banco SQLite (ex: ./database.sqlite)',
    generate: (params) => {
      const dbPath = params?.dbPath || './database.sqlite';
      return {
        command: 'uvx',
        args: ['mcp-server-sqlite', '--db-path', dbPath],
        type: 'stdio',
        description: `SQLite DB connector (${dbPath})`,
      };
    },
  },
  github: {
    name: 'github',
    description: 'Ferramentas MCP para operações avançadas no GitHub',
    type: 'stdio',
    paramHelp: 'Token do GitHub (opcional se já autenticado)',
    generate: (params) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: params?.token ? { GITHUB_PERSONAL_ACCESS_TOKEN: params.token } : undefined,
      type: 'stdio',
      description: 'GitHub MCP Server for repos, PRs and issues',
    }),
  },
  postgres: {
    name: 'postgres',
    description: 'Conector MCP para consultas seguras em PostgreSQL',
    type: 'stdio',
    paramHelp: 'Connection string PostgreSQL (ex: postgresql://user:pass@localhost:5432/mydb)',
    generate: (params) => {
      const connStr = params?.connectionString || 'postgresql://localhost:5432/mydb';
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', connStr],
        type: 'stdio',
        description: `PostgreSQL connector (${connStr})`,
      };
    },
  },
  filesystem: {
    name: 'filesystem',
    description: 'Acesso MCP estruturado a pastas do projeto',
    type: 'stdio',
    paramHelp: 'Caminho do diretório permitido',
    generate: (params) => {
      const dirPath = params?.dirPath || process.cwd();
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', dirPath],
        type: 'stdio',
        description: `Filesystem MCP (${dirPath})`,
      };
    },
  },
};

export class McpManager {
  /**
   * Load MCP configuration from file.
   */
  static loadConfig(filePath: string): McpConfigFile {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as McpConfigFile;
      } catch {
        return { mcpServers: {} };
      }
    }
    return { mcpServers: {} };
  }

  /**
   * Save MCP configuration to file.
   */
  static saveConfig(filePath: string, config: McpConfigFile): void {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Add a server to MCP config.
   */
  static addServer(
    name: string,
    rawServerDef: unknown,
    options: {
      target?: 'local' | 'global' | 'both';
      workspaceRoot?: string;
    } = {}
  ): McpServerDefinition {
    const serverDef = McpServerDefinitionSchema.parse(rawServerDef);
    const target = options.target || 'local';
    const paths = resolveHubPaths(options.workspaceRoot);

    const targetFiles: { filePath: string; label: string }[] = [];
    if (target === 'local' || target === 'both') {
      targetFiles.push({ filePath: paths.localMcpFile, label: 'Projeto Local (.agents/mcp.json)' });
    }
    if (target === 'global' || target === 'both') {
      targetFiles.push({ filePath: paths.globalMcpFile, label: 'Global Antigravity (~/.gemini/config/mcp.json)' });
    }

    for (const { filePath, label } of targetFiles) {
      const config = this.loadConfig(filePath);
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[name] = serverDef;
      this.saveConfig(filePath, config);
      console.log(`[OK] [${label}] Servidor MCP '${name}' registrado com sucesso.`);
    }

    return serverDef;
  }

  /**
   * Add a preset MCP server.
   */
  static addPreset(
    presetName: string,
    params: Record<string, string> = {},
    options: { target?: 'local' | 'global' | 'both'; workspaceRoot?: string; customName?: string } = {}
  ): McpServerDefinition {
    const preset = MCP_PRESETS[presetName.toLowerCase()];
    if (!preset) {
      const available = Object.keys(MCP_PRESETS).join(', ');
      throw new Error(`Preset MCP desconhecido: '${presetName}'. Presets disponíveis: ${available}`);
    }

    const serverDef = preset.generate(params);
    const serverName = options.customName || preset.name;
    return this.addServer(serverName, serverDef, options);
  }

  /**
   * Connect an external REST API by generating an API MCP connector or Antigravity skill wrapper.
   */
  static addApiConnector(
    name: string,
    apiConfig: {
      baseUrl: string;
      authHeader?: string;
      token?: string;
      description?: string;
    },
    options: { target?: 'local' | 'global' | 'both'; workspaceRoot?: string } = {}
  ): void {
    const paths = resolveHubPaths(options.workspaceRoot);
    const target = options.target || 'local';

    // 1. Register in mcp.json (SSE/HTTP format if supported)
    this.addServer(
      name,
      {
        url: apiConfig.baseUrl,
        type: 'sse',
        description: apiConfig.description || `REST API Connector for ${apiConfig.baseUrl}`,
      },
      options
    );

    // 2. Also generate a companion Antigravity Skill with helper cURL script
    const skillName = `api-${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
    const targetSkillsDir = target === 'global' ? paths.globalSkillsDir : paths.localSkillsDir;
    const skillDir = path.join(targetSkillsDir, skillName);
    ensureDir(path.join(skillDir, 'scripts'));

    const helperScript = `#!/usr/bin/env bash
# Helper script to call ${name} API safely
set -euo pipefail

BASE_URL="${apiConfig.baseUrl}"
AUTH_HEADER="${apiConfig.authHeader || 'Authorization'}"
TOKEN="${apiConfig.token || '$API_TOKEN'}"

ENDPOINT="\${1:-}"
METHOD="\${2:-GET}"
DATA="\${3:-}"

if [ -z "$ENDPOINT" ]; then
  echo "Uso: ./call.sh <endpoint> [GET|POST|PUT|DELETE] [json_data]"
  exit 1
fi

if [ -n "$DATA" ]; then
  curl -s -X "$METHOD" "$BASE_URL$ENDPOINT" \\
    -H "Content-Type: application/json" \\
    -H "$AUTH_HEADER: $TOKEN" \\
    -d "$DATA"
else
  curl -s -X "$METHOD" "$BASE_URL$ENDPOINT" \\
    -H "$AUTH_HEADER: $TOKEN"
fi
`;

    fs.writeFileSync(path.join(skillDir, 'scripts', 'call.sh'), helperScript, 'utf-8');
    try {
      fs.chmodSync(path.join(skillDir, 'scripts', 'call.sh'), 0o755);
    } catch {}

    const skillDoc = `---
name: ${skillName}
description: Permite interagir diretamente com a API ${name} (${apiConfig.baseUrl}).
---

# API Connector: ${name}

Use esta habilidade para realizar consultas e ações na API **${name}**.

## Configuração da API
- Base URL: \`${apiConfig.baseUrl}\`
- Autenticação: Header \`${apiConfig.authHeader || 'Authorization'}\`

## Como Executar Chamadas
Você pode disparar chamadas para os endpoints da API utilizando o script auxiliar pré-configurado:
\`\`\`bash
<path_da_skill>/scripts/call.sh /endpoint [METODO] [payload_json]
\`\`\`
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillDoc, 'utf-8');

    console.log(`[OK] Conector de API '${name}' criado com sucesso!`);
    console.log(`   - MCP Server: mcp.json -> '${name}'`);
    console.log(`   - Skill com Script Auxiliar: ${path.join(skillDir, 'SKILL.md')}`);
  }

  /**
   * List all configured MCP servers.
   */
  static listServers(options: { workspaceRoot?: string } = {}): {
    local: Record<string, McpServerDefinition>;
    global: Record<string, McpServerDefinition>;
  } {
    const paths = resolveHubPaths(options.workspaceRoot);
    const local = this.loadConfig(paths.localMcpFile).mcpServers || {};
    const global = this.loadConfig(paths.globalMcpFile).mcpServers || {};
    return { local, global };
  }
}
