#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { GitHubSkillImporter } from '../importers/github.js';
import { AgentManager } from '../agents/agent-manager.js';
import { McpManager, MCP_PRESETS } from '../mcp/mcp-manager.js';
import { resolveHubPaths, ensureDir } from '../utils/paths.js';

const program = new Command();

program
  .name('ag-hub')
  .description('Universal Agent, Skill & MCP Manager for Antigravity (Strict MIT/Apache-2.0 License Enforcement & Chat Activation)')
  .version('1.0.0');

// ==========================================
// INIT COMMAND
// ==========================================
program
  .command('init')
  .description('Inicializa a estrutura padrão .agents/ no diretório atual')
  .action(() => {
    const paths = resolveHubPaths();
    ensureDir(paths.localAgentsDir);
    ensureDir(paths.localSkillsDir);
    ensureDir(path.join(paths.localAgentsDir, 'agents'));

    if (!fs.existsSync(paths.localMcpFile)) {
      McpManager.saveConfig(paths.localMcpFile, { mcpServers: {} });
    }

    const configFile = path.join(paths.localAgentsDir, 'config.json');
    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(
        configFile,
        JSON.stringify(
          {
            version: '1.0.0',
            licensePolicy: 'strict-mit-apache2',
            description: 'Antigravity Workspace Configuration',
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    console.log(`\n🚀 Estrutura de agentes e skills inicializada com sucesso em: ${paths.workspaceRoot}`);
    console.log(`   - Diretório de habilidades: ${paths.localSkillsDir}`);
    console.log(`   - Diretório de agentes: ${path.join(paths.localAgentsDir, 'agents')}`);
    console.log(`   - Configuração MCP: ${paths.localMcpFile}`);
    console.log(`   - Política de licença: 0% risco legal (Apenas MIT e Apache-2.0)\n`);
  });

// ==========================================
// SKILL COMMANDS
// ==========================================
const skillCmd = program.command('skill').description('Gerenciamento de habilidades (skills)');

skillCmd
  .command('add <url>')
  .description('Importa uma skill a partir do GitHub com verificação estrita de licença (MIT ou Apache-2.0)')
  .option('-g, --global', 'Instala globalmente em ~/.gemini/config/skills para uso em qualquer projeto')
  .option('-n, --name <name>', 'Sobrescreve o nome da skill')
  .action(async (url: string, opts: { global?: boolean; name?: string }) => {
    try {
      const target = opts.global ? 'global' : 'local';
      await GitHubSkillImporter.importSkill(url, {
        target,
        customName: opts.name,
      });
    } catch (err) {
      console.error(`\n❌ Falha ao importar skill: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('list')
  .description('Lista todas as skills instaladas (locais e globais)')
  .action(() => {
    const paths = resolveHubPaths();
    console.log('\n📦 Skills Instaladas:\n');

    console.log('--- [Projeto Local: .agents/skills/] ---');
    if (fs.existsSync(paths.localSkillsDir)) {
      const dirs = fs.readdirSync(paths.localSkillsDir);
      if (dirs.length === 0) console.log('  (Nenhuma skill local instalada)');
      dirs.forEach((d) => console.log(`  • ${d}`));
    } else {
      console.log('  (Diretório local .agents/skills não inicializado)');
    }

    console.log('\n--- [Global: ~/.gemini/config/skills/] ---');
    if (fs.existsSync(paths.globalSkillsDir)) {
      const dirs = fs.readdirSync(paths.globalSkillsDir);
      if (dirs.length === 0) console.log('  (Nenhuma skill global instalada)');
      dirs.forEach((d) => console.log(`  • ${d}`));
    } else {
      console.log('  (Nenhum diretório global encontrado)');
    }
    console.log('');
  });

skillCmd
  .command('push <name>')
  .description('Sobe e salva uma skill no seu repositório central do GitHub (Mauthope/antigravity-hub)')
  .action((name: string) => {
    const paths = resolveHubPaths();
    const sourceLocal = path.join(paths.localSkillsDir, name);
    const sourceGlobal = path.join(paths.globalSkillsDir, name);
    const sourceDir = fs.existsSync(sourceGlobal) ? sourceGlobal : fs.existsSync(sourceLocal) ? sourceLocal : null;

    if (!sourceDir) {
      console.error(`\n❌ Skill '${name}' não encontrada nem em local (.agents/skills) nem em global (~/.gemini/config/skills).\n`);
      process.exit(1);
    }

    const repoSkillsDir = path.join('/home/antigravity/antigravity-hub/skills', name);
    ensureDir(repoSkillsDir);

    const cpFiles = (src: string, dest: string) => {
      ensureDir(dest);
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          cpFiles(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    cpFiles(sourceDir, repoSkillsDir);

    try {
      const { execSync } = require('node:child_process');
      execSync(`git add skills/${name} && git commit -m "feat(skills): save ${name} to cloud hub" && git push origin main`, {
        cwd: '/home/antigravity/antigravity-hub',
        stdio: 'inherit',
      });
      console.log(`\n🎉 Sucesso! A skill '${name}' foi salva e enviada para o seu GitHub:`);
      console.log(`   👉 https://github.com/Mauthope/antigravity-hub/tree/main/skills/${name}\n`);
    } catch (err) {
      console.error(`\n❌ Erro ao enviar para o GitHub: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

skillCmd
  .command('create <name>')
  .description('Cria um esqueleto padronizado de nova skill com frontmatter YAML')
  .option('-g, --global', 'Cria no escopo global')
  .option('-d, --description <desc>', 'Descrição da habilidade')
  .action((name: string, opts: { global?: boolean; description?: string }) => {
    const paths = resolveHubPaths();
    const targetDir = opts.global ? paths.globalSkillsDir : paths.localSkillsDir;
    const skillPath = path.join(targetDir, name);
    ensureDir(path.join(skillPath, 'scripts'));
    ensureDir(path.join(skillPath, 'references'));

    const content = `---
name: ${name}
description: ${opts.description || `Habilidade personalizada ${name}`}
license: MIT
version: 1.0.0
---

# ${name}

Instruções detalhadas para a habilidade.

## Como utilizar
1. Passo inicial...
2. Ações...
`;
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content, 'utf-8');
    console.log(`\n✨ Nova skill '${name}' criada em: ${skillPath}\n`);
  });

// ==========================================
// AGENT COMMANDS
// ==========================================
const agentCmd = program.command('agent').description('Gerenciamento e invocação de agentes');

agentCmd
  .command('create <name>')
  .description('Cria um novo agente e registra o slash command para chamá-lo no chat (/nome-do-agente)')
  .option('-r, --role <role>', 'Papel do agente (ex: Senior Code Reviewer)')
  .option('-d, --description <desc>', 'Descrição sucinta das responsabilidades')
  .option('-p, --prompt <prompt>', 'Prompt de sistema com as diretrizes do agente')
  .option('-m, --mcp <servers...>', 'Servidores MCP vinculados (ex: sqlite fetch)')
  .option('-s, --skills <skills...>', 'Skills vinculadas')
  .option('-l, --local', 'Salva apenas no projeto local (padrão é global para acesso em qualquer projeto)')
  .action(async (name: string, opts: {
    role?: string;
    description?: string;
    prompt?: string;
    mcp?: string[];
    skills?: string[];
    local?: boolean;
  }) => {
    try {
      const target = opts.local ? 'local' : 'global';
      const role = opts.role || `${name.charAt(0).toUpperCase() + name.slice(1)} Specialist`;
      const description = opts.description || `Agente especializado em ${name}`;
      const prompt =
        opts.prompt ||
        `Você é o agente especialista ${role}. Forneça respostas precisas, metodológicas e foque em alta qualidade de código e arquitetura.`;

      await AgentManager.registerAgent(
        {
          name,
          role,
          description,
          system_prompt: prompt,
          tools: { write: true, subagents: true, mcp: true },
          skills: opts.skills || [],
          mcp_servers: opts.mcp || [],
        },
        { target }
      );

      console.log(`\n🎉 Agente '${name}' pronto!`);
      console.log(`👉 Agora você pode chamá-lo no chat em QUALQUER projeto digitando: /${name} ou "chame o agente ${name}"\n`);
    } catch (err) {
      console.error(`\n❌ Erro ao criar agente: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

agentCmd
  .command('list')
  .description('Lista todos os agentes disponíveis para invocação no chat')
  .action(() => {
    const { local, global } = AgentManager.listAgents();
    console.log('\n🤖 Agentes Disponíveis para Invocação no Chat:\n');

    console.log('--- [Globais (Acessíveis em QUALQUER projeto)] ---');
    if (global.length === 0) console.log('  (Nenhum agente global cadastrado)');
    global.forEach((a) => {
      console.log(`  • /${a.name} -> ${a.role}`);
      console.log(`    Descrição: ${a.description}`);
      console.log(`    MCPs: ${a.mcp_servers.length ? a.mcp_servers.join(', ') : 'Nenhum'}`);
    });

    console.log('\n--- [Locais deste Projeto] ---');
    if (local.length === 0) console.log('  (Nenhum agente local cadastrado)');
    local.forEach((a) => {
      console.log(`  • /${a.name} -> ${a.role}`);
      console.log(`    Descrição: ${a.description}`);
    });
    console.log('');
  });

agentCmd
  .command('delete <name>')
  .description('Remove um agente e seu comando de ativação no chat')
  .action((name: string) => {
    const deleted = AgentManager.deleteAgent(name);
    if (deleted) {
      console.log(`\n🗑️ Agente '${name}' e seu comando de chat foram removidos com sucesso.\n`);
    } else {
      console.log(`\n⚠️ Agente '${name}' não encontrado.\n`);
    }
  });

// ==========================================
// MCP COMMANDS
// ==========================================
const mcpCmd = program.command('mcp').description('Gerenciamento de servidores MCP (Model Context Protocol)');

mcpCmd
  .command('list')
  .description('Lista os servidores MCP configurados')
  .action(() => {
    const { local, global } = McpManager.listServers();
    console.log('\n🔌 Servidores MCP Configurados:\n');

    console.log('--- [Projeto Local: .agents/mcp.json] ---');
    const localKeys = Object.keys(local);
    if (localKeys.length === 0) console.log('  (Nenhum servidor local)');
    localKeys.forEach((k) => {
      const s = local[k];
      console.log(`  • ${k} (${s.type}): ${s.command ? `${s.command} ${(s.args || []).join(' ')}` : s.url}`);
    });

    console.log('\n--- [Global: ~/.gemini/config/mcp.json] ---');
    const globalKeys = Object.keys(global);
    if (globalKeys.length === 0) console.log('  (Nenhum servidor global)');
    globalKeys.forEach((k) => {
      const s = global[k];
      console.log(`  • ${k} (${s.type}): ${s.command ? `${s.command} ${(s.args || []).join(' ')}` : s.url}`);
    });
    console.log('');
  });

mcpCmd
  .command('preset <name>')
  .description('Adiciona um preset oficial de MCP (sqlite, fetch, github, postgres, filesystem)')
  .option('-g, --global', 'Configura no escopo global')
  .option('--db <path>', 'Caminho do banco SQLite')
  .option('--conn <str>', 'Connection string PostgreSQL')
  .option('--token <token>', 'Token do GitHub')
  .option('--dir <path>', 'Diretório para Filesystem')
  .action((name: string, opts: { global?: boolean; db?: string; conn?: string; token?: string; dir?: string }) => {
    try {
      const target = opts.global ? 'global' : 'local';
      McpManager.addPreset(
        name,
        {
          dbPath: opts.db || '',
          connectionString: opts.conn || '',
          token: opts.token || '',
          dirPath: opts.dir || '',
        },
        { target }
      );
    } catch (err) {
      console.error(`\n❌ Erro ao adicionar preset MCP: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

mcpCmd
  .command('add <name>')
  .description('Adiciona um servidor MCP customizado (stdio ou SSE)')
  .requiredOption('-c, --command <cmd>', 'Comando executável (para stdio)')
  .option('-a, --args <args...>', 'Argumentos para o comando')
  .option('-g, --global', 'Configura no escopo global')
  .action((name: string, opts: { command: string; args?: string[]; global?: boolean }) => {
    try {
      const target = opts.global ? 'global' : 'local';
      McpManager.addServer(
        name,
        {
          command: opts.command,
          args: opts.args || [],
          type: 'stdio',
        },
        { target }
      );
    } catch (err) {
      console.error(`\n❌ Erro ao adicionar servidor MCP: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

// ==========================================
// API CONNECTOR COMMAND
// ==========================================
program
  .command('api-connect <name>')
  .description('Conecta uma API REST ao Antigravity, gerando conector MCP e skill com script cURL auxiliar')
  .requiredOption('-u, --url <url>', 'Base URL da API')
  .option('-h, --header <header>', 'Header de autorização (ex: Authorization ou X-Api-Key)')
  .option('-t, --token <token>', 'Token de autenticação')
  .option('-g, --global', 'Configura no escopo global')
  .action((name: string, opts: { url: string; header?: string; token?: string; global?: boolean }) => {
    try {
      const target = opts.global ? 'global' : 'local';
      McpManager.addApiConnector(
        name,
        {
          baseUrl: opts.url,
          authHeader: opts.header,
          token: opts.token,
        },
        { target }
      );
    } catch (err) {
      console.error(`\n❌ Erro ao conectar API: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

program.parse(process.argv);
