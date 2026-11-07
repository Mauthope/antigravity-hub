import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LicenseVerifier } from '../dist/license/verifier.js';
import { GitHubSkillImporter } from '../dist/importers/github.js';
import { AgentManager } from '../dist/agents/agent-manager.js';
import { McpManager } from '../dist/mcp/mcp-manager.js';

describe('Antigravity Hub - Testes Automatizados', () => {
  // ==========================================
  // 1. AUDITORIA DE LICENÇA (0% RISCO LEGAL)
  // ==========================================
  describe('Auditoria Estrita de Licenças (Apenas MIT e Apache-2.0)', () => {
    test('Deve APROVAR texto de licença MIT', () => {
      const mitText = `MIT License\n\nCopyright (c) 2026\nPermission is hereby granted, free of charge...`;
      const res = LicenseVerifier.verifyText(mitText, 'teste-mit');
      assert.equal(res.valid, true);
      assert.equal(res.spdxId, 'MIT');
    });

    test('Deve APROVAR identificador SPDX: MIT', () => {
      const spdxText = `// SPDX-License-Identifier: MIT\nconsole.log("hello");`;
      const res = LicenseVerifier.verifyText(spdxText, 'teste-spdx-mit');
      assert.equal(res.valid, true);
      assert.equal(res.spdxId, 'MIT');
    });

    test('Deve APROVAR identificador SPDX: Apache-2.0', () => {
      const spdxText = `/* SPDX-License-Identifier: Apache-2.0 */\npackage main`;
      const res = LicenseVerifier.verifyText(spdxText, 'teste-spdx-apache');
      assert.equal(res.valid, true);
      assert.equal(res.spdxId, 'Apache-2.0');
    });

    test('Deve BLOQUEAR licença GPL (0% de Risco Jurídico)', () => {
      const gplText = `GNU General Public License\nVersion 3, 29 June 2007...`;
      const res = LicenseVerifier.verifyText(gplText, 'teste-gpl');
      assert.equal(res.valid, false);
      assert.match(res.error, /BLOQUEIO JURÍDICO/);
      assert.match(res.error, /GPL/);
    });

    test('Deve BLOQUEAR código sem licença explícita (Todos os direitos reservados)', () => {
      const unlicensed = `// Minha lib proprietária\nfunction secret() {}`;
      const res = LicenseVerifier.verifyText(unlicensed, 'teste-sem-licenca');
      assert.equal(res.valid, false);
      assert.match(res.error, /BLOQUEIO JURÍDICO/);
    });

    test('Deve APROVAR repositório remoto real com MIT (Express)', async () => {
      const res = await LicenseVerifier.verifyRepo('expressjs', 'express');
      assert.equal(res.valid, true);
      assert.equal(res.spdxId, 'MIT');
    });

    test('Deve APROVAR repositório remoto real com Apache-2.0 (Kubernetes)', async () => {
      const res = await LicenseVerifier.verifyRepo('kubernetes', 'kubernetes');
      assert.equal(res.valid, true);
      assert.equal(res.spdxId, 'Apache-2.0');
    });

    test('Deve REJEITAR repositório sem licença permitida (Linux kernel / GPL)', async () => {
      const res = await LicenseVerifier.verifyRepo('torvalds', 'linux');
      assert.equal(res.valid, false);
      assert.match(res.error, /BLOQUEIO DE CONFORMIDADE JURÍDICA/);
    });
  });

  // ==========================================
  // 2. PARSER DE URLS DO GITHUB
  // ==========================================
  describe('Parser de URLs do GitHub', () => {
    test('Deve interpretar URLs padrão de repositório', () => {
      const p = GitHubSkillImporter.parseUrl('https://github.com/foo/bar');
      assert.equal(p.owner, 'foo');
      assert.equal(p.repo, 'bar');
      assert.equal(p.branch, 'main');
    });

    test('Deve interpretar URLs com tree e branch', () => {
      const p = GitHubSkillImporter.parseUrl('https://github.com/owner/repo/tree/dev/skills/custom');
      assert.equal(p.owner, 'owner');
      assert.equal(p.repo, 'repo');
      assert.equal(p.branch, 'dev');
      assert.equal(p.subpath, 'skills/custom');
    });

    test('Deve interpretar URLs diretas para SKILL.md', () => {
      const p = GitHubSkillImporter.parseUrl('https://github.com/owner/repo/blob/main/skills/test/SKILL.md');
      assert.equal(p.subpath, 'skills/test/SKILL.md');
    });

    test('Deve interpretar formato shorthand owner/repo', () => {
      const p = GitHubSkillImporter.parseUrl('facebook/react');
      assert.equal(p.owner, 'facebook');
      assert.equal(p.repo, 'react');
    });
  });

  // ==========================================
  // 3. REGISTRO E INVOCACAO DE AGENTES NO CHAT
  // ==========================================
  describe('Gerenciador de Agentes & Ativação no Chat', () => {
    const testAgentName = 'test-architect';

    test('Deve registrar agente e gerar comando de ativação no chat (~/.gemini/config/skills/)', async () => {
      const agent = await AgentManager.registerAgent({
        name: testAgentName,
        role: 'Software Architect Senior',
        description: 'Especialista em microsserviços e padrões de projeto',
        system_prompt: 'Você é um arquiteto experiente focado em manutenibilidade e escalabilidade.',
        tools: { write: true, subagents: true, mcp: true },
        skills: ['github'],
        mcp_servers: ['sqlite'],
      }, { target: 'global' });

      assert.equal(agent.name, testAgentName);
      assert.equal(agent.role, 'Software Architect Senior');

      // Verifica se o arquivo SKILL.md de invocação foi gerado
      const skillPath = path.join(os.homedir(), '.gemini', 'config', 'skills', testAgentName, 'SKILL.md');
      assert.equal(fs.existsSync(skillPath), true, 'Arquivo de ativação no chat SKILL.md deve existir');

      const content = fs.readFileSync(skillPath, 'utf-8');
      assert.match(content, /Software Architect Senior/);
      assert.match(content, /diretrizes/i);

      // Limpeza do teste
      AgentManager.deleteAgent(testAgentName, { target: 'global' });
    });
  });

  // ==========================================
  // 4. PRESETS E GERENCIAMENTO MCP
  // ==========================================
  describe('Gerenciador MCP e Presets', () => {
    test('Deve configurar presets do MCP corretamente', () => {
      const tmpMcpFile = path.join(os.tmpdir(), `test-mcp-${Date.now()}.json`);
      const paths = { localMcpFile: tmpMcpFile };

      const serverDef = McpManager.addPreset('fetch', {}, { target: 'local', workspaceRoot: os.tmpdir() });
      assert.equal(serverDef.command, 'uvx');
      assert.deepEqual(serverDef.args, ['mcp-server-fetch']);
    });
  });
});
