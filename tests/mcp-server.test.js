import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHubMcpServer,
  fetchAllAgents,
  fetchAgentByName,
  persistAgent,
  removeAgent,
} from '../dist/mcp-server/server.js';
import { LicenseVerifier } from '../dist/license/verifier.js';

describe('Antigravity Hub - Servidor MCP Oficial', () => {
  test('Deve instanciar o Servidor MCP corretamente com @modelcontextprotocol/sdk', () => {
    const server = createHubMcpServer();
    assert.ok(server);
  });

  test('Deve listar agentes (inicialmente limpo ou com agentes existentes)', async () => {
    const agents = await fetchAllAgents();
    assert.ok(Array.isArray(agents));
  });

  test('Deve salvar e recuperar um agente via funções do MCP Server', async () => {
    const testName = 'test-mcp-agent';
    const testContent = `# Agente de Teste MCP\n\n## O Que Este Agente Faz\nExecuta testes unitários de integração MCP.\n\n## Quando Usar\nEm ambiente de testes.`;

    const saved = await persistAgent(testName, testContent, 'Agente de Teste MCP', 'MIT');
    assert.equal(saved.name, testName);

    const fetched = await fetchAgentByName(testName);
    assert.ok(fetched);
    assert.equal(fetched.name, testName);
    assert.equal(fetched.title, 'Agente de Teste MCP');
    assert.ok(fetched.content.includes('Executa testes unitários'));

    // Limpeza
    const removed = await removeAgent(testName);
    assert.ok(removed.success);

    const afterDelete = await fetchAgentByName(testName);
    assert.equal(afterDelete, null);
  });

  test('Auditoria de Licença no MCP deve APROVAR repositório MIT (Express)', async () => {
    const audit = await LicenseVerifier.verifyRepo('expressjs', 'express');
    assert.equal(audit.valid, true);
    assert.equal(audit.spdxId, 'MIT');
  });

  test('Auditoria de Licença no MCP deve APROVAR repositório Apache-2.0 (google-research/timesfm)', async () => {
    const audit = await LicenseVerifier.verifyRepo('google-research', 'timesfm');
    assert.equal(audit.valid, true);
    assert.equal(audit.spdxId, 'Apache-2.0');
  });

  test('Auditoria de Licença no MCP deve BLOQUEAR repositório GPL (Linux)', async () => {
    const audit = await LicenseVerifier.verifyRepo('torvalds', 'linux');
    assert.equal(audit.valid, false);
  });
});
