import path from 'node:path';
import fs from 'node:fs';
import {
  AgentDefinition,
  AgentDefinitionSchema,
  HubPaths,
} from '../types/index.js';
import { resolveHubPaths, ensureDir } from '../utils/paths.js';

export class AgentManager {
  /**
   * Create and register an agent locally and/or globally.
   * Crucially registers the agent as an executable Skill in ~/.gemini/config/skills/<name>/SKILL.md
   * so the user can call the agent directly in chat from ANY project!
   */
  static async registerAgent(
    rawDef: unknown,
    options: {
      target?: 'local' | 'global' | 'both';
      workspaceRoot?: string;
    } = {}
  ): Promise<AgentDefinition> {
    const agentDef = AgentDefinitionSchema.parse(rawDef);
    const target = options.target || 'global'; // default global so it's accessible anywhere!
    const paths = resolveHubPaths(options.workspaceRoot);

    const targetDirs: { agentsDir: string; skillsDir: string; label: string }[] = [];

    if (target === 'local' || target === 'both') {
      targetDirs.push({
        agentsDir: path.join(paths.localAgentsDir, 'agents'),
        skillsDir: paths.localSkillsDir,
        label: 'Projeto Local',
      });
    }

    if (target === 'global' || target === 'both') {
      targetDirs.push({
        agentsDir: paths.globalAgentsDir,
        skillsDir: paths.globalSkillsDir,
        label: 'Global Antigravity (~/.gemini/config)',
      });
    }

    for (const { agentsDir, skillsDir, label } of targetDirs) {
      ensureDir(agentsDir);
      ensureDir(skillsDir);

      // 1. Save agent.json definition
      const agentJsonPath = path.join(agentsDir, `${agentDef.name}.json`);
      fs.writeFileSync(agentJsonPath, JSON.stringify(agentDef, null, 2), 'utf-8');

      // 2. Generate and save the Agent Activation Skill (SKILL.md)
      // This is what allows typing /<agent-name> in chat or saying "chame o agente <nome>"!
      const agentSkillDir = path.join(skillsDir, agentDef.name);
      ensureDir(agentSkillDir);

      const skillContent = this.generateAgentSkillContent(agentDef);
      const skillFilePath = path.join(agentSkillDir, 'SKILL.md');
      fs.writeFileSync(skillFilePath, skillContent, 'utf-8');

      console.log(`✅ [${label}] Agente '${agentDef.name}' registrado.`);
      console.log(`   - Definição: ${agentJsonPath}`);
      console.log(`   - Invocação no Chat: ${skillFilePath} (Comando: /${agentDef.name})`);
    }

    return agentDef;
  }

  /**
   * Generate the SKILL.md markdown that empowers Antigravity to assume the agent role in chat.
   */
  static generateAgentSkillContent(agent: AgentDefinition): string {
    const mcpServersText = agent.mcp_servers && agent.mcp_servers.length > 0
      ? agent.mcp_servers.join(', ')
      : 'Nenhum servidor MCP adicional exigido';

    const skillsText = agent.skills && agent.skills.length > 0
      ? agent.skills.join(', ')
      : 'Habilidades padrão do projeto';

    return `---
name: ${agent.name}
description: Ativa o agente especializado '${agent.role}' (${agent.description}). Invoque digitando /${agent.name} ou solicitando no chat.
---

# Agente: ${agent.role} (\`${agent.name}\`)

Você foi invocado para atuar diretamente como o agente especialista **${agent.role}**.
Assuma imediatamente as diretrizes, tom, postura e capacidades definidas abaixo.

## 🎯 Descrição do Papel
${agent.description}

## 🧠 Instruções de Sistema e Diretrizes Operacionais
${agent.system_prompt}

## 🛠️ Ferramentas & Conexões
- **Permissão de escrita / modificação de código**: ${agent.tools.write ? 'Sim (Total)' : 'Não (Somente leitura)'}
- **Permissão para delegar a subagentes**: ${agent.tools.subagents ? 'Sim' : 'Não'}
- **Acesso a ferramentas MCP**: ${agent.tools.mcp ? 'Sim' : 'Não'}
- **Habilidades associadas**: ${skillsText}
- **Servidores MCP conectados**: ${mcpServersText}

## 💬 Comportamento de Inicialização
Ao ser acionado pelo usuário:
1. Cumprimente o usuário informando brevemente que o agente **${agent.role}** está ativo e pronto.
2. Foque imediatamente na demanda do usuário com o rigor técnico e abordagem descritos em suas diretrizes.
`;
  }

  /**
   * List all registered agents (both local and global).
   */
  static listAgents(options: { workspaceRoot?: string } = {}): {
    local: AgentDefinition[];
    global: AgentDefinition[];
  } {
    const paths = resolveHubPaths(options.workspaceRoot);
    const local: AgentDefinition[] = [];
    const global: AgentDefinition[] = [];

    // Read local agents
    const localDir = path.join(paths.localAgentsDir, 'agents');
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(localDir, file), 'utf-8');
          local.push(AgentDefinitionSchema.parse(JSON.parse(content)));
        } catch {
          // ignore corrupted files
        }
      }
    }

    // Read global agents
    if (fs.existsSync(paths.globalAgentsDir)) {
      const files = fs.readdirSync(paths.globalAgentsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(paths.globalAgentsDir, file), 'utf-8');
          global.push(AgentDefinitionSchema.parse(JSON.parse(content)));
        } catch {
          // ignore corrupted files
        }
      }
    }

    return { local, global };
  }

  /**
   * Get an agent by name.
   */
  static getAgent(name: string, options: { workspaceRoot?: string } = {}): AgentDefinition | null {
    const { local, global } = this.listAgents(options);
    return local.find((a) => a.name === name) || global.find((a) => a.name === name) || null;
  }

  /**
   * Delete an agent.
   */
  static deleteAgent(name: string, options: { target?: 'local' | 'global' | 'both'; workspaceRoot?: string } = {}): boolean {
    const paths = resolveHubPaths(options.workspaceRoot);
    const target = options.target || 'both';
    let deleted = false;

    if (target === 'local' || target === 'both') {
      const localJson = path.join(paths.localAgentsDir, 'agents', `${name}.json`);
      const localSkill = path.join(paths.localSkillsDir, name);
      if (fs.existsSync(localJson)) {
        fs.unlinkSync(localJson);
        deleted = true;
      }
      if (fs.existsSync(localSkill)) {
        fs.rmSync(localSkill, { recursive: true, force: true });
        deleted = true;
      }
    }

    if (target === 'global' || target === 'both') {
      const globalJson = path.join(paths.globalAgentsDir, `${name}.json`);
      const globalSkill = path.join(paths.globalSkillsDir, name);
      if (fs.existsSync(globalJson)) {
        fs.unlinkSync(globalJson);
        deleted = true;
      }
      if (fs.existsSync(globalSkill)) {
        fs.rmSync(globalSkill, { recursive: true, force: true });
        deleted = true;
      }
    }

    return deleted;
  }
}
