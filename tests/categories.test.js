import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAgentCategory,
  parseAgentDetails,
} from '../dist/lib/db.js';
import {
  fetchAllAgents,
  persistAgent,
  removeAgent,
} from '../dist/mcp-server/server.js';
import { AGENT_CATEGORIES } from '../dist/types/index.js';

describe('Antigravity Hub - Sistema de Categorização de Agentes', () => {
  test('Deve conter as 7 categorias oficiais com IDs e metadados válidos', () => {
    assert.equal(AGENT_CATEGORIES.length, 7);
    const ids = AGENT_CATEGORIES.map((c) => c.id);
    assert.deepEqual(ids, [
      'design',
      'development',
      'architecture',
      'security',
      'data',
      'orchestration',
      'general',
    ]);
  });

  test('Deve detectar categoria "design" para agentes de UI/UX e Akiom Arvoredo', () => {
    const cat1 = detectAgentCategory('designer-arvoredo-master', 'Agente de Design System e interfaces táteis');
    assert.equal(cat1, 'design');

    const cat2 = detectAgentCategory('frontend-stylist', 'Especialista em Tailwind CSS e Figma');
    assert.equal(cat2, 'design');
  });

  test('Deve detectar categoria "security" para agentes de code review e auditoria', () => {
    const cat = detectAgentCategory('code-auditor', 'Responsável por análise OWASP e conformidade estrita');
    assert.equal(cat, 'security');
  });

  test('Deve detectar categoria "architecture" para agentes de nuvem e bancos', () => {
    const cat = detectAgentCategory('cloud-architect', 'Especialista em Neon PostgreSQL e microsserviços');
    assert.equal(cat, 'architecture');
  });

  test('Deve detectar categoria "data" para modelos e TimesFM', () => {
    const cat = detectAgentCategory('timesfm-analyst', 'Previsão de séries temporais com machine learning');
    assert.equal(cat, 'data');
  });

  test('Deve detectar categoria "orchestration" para agentes de fluxo MCP', () => {
    const cat = detectAgentCategory('hub-orchestrator', 'Coordenação de subagentes e ferramentas MCP');
    assert.equal(cat, 'orchestration');
  });

  test('Deve respeitar category explícita ou definida no frontmatter YAML', () => {
    const fmContent = `---\nname: my-bot\ncategory: security\n---\n# Meu Bot`;
    const catFromFm = detectAgentCategory('custom-bot', fmContent);
    assert.equal(catFromFm, 'security');

    const catExplicit = detectAgentCategory('bot', 'conteudo qualquer', 'data');
    assert.equal(catExplicit, 'data');
  });

  test('parseAgentDetails deve retornar categoria e tags contextuais', () => {
    const details = parseAgentDetails(
      '# Mestre Akiom\n\n## O Que Este Agente Faz\nCria interfaces táteis.\n\n## Quando Usar\nEm projetos web.',
      'designer-akiom'
    );
    assert.equal(details.category, 'design');
    assert.ok(details.tags.includes('Design System'));
    assert.ok(details.tags.includes('UI/UX'));
  });

  test('Deve salvar e filtrar agentes por categoria no MCP Server', async () => {
    const nameDesign = 'test-cat-design';
    const nameSec = 'test-cat-sec';

    await persistAgent(nameDesign, '# Designer\nDesign system', 'Design Bot', 'MIT', undefined, 'design');
    await persistAgent(nameSec, '# Security\nReview', 'Security Bot', 'MIT', undefined, 'security');

    try {
      const all = await fetchAllAgents();
      assert.ok(all.some((a) => a.name === nameDesign));
      assert.ok(all.some((a) => a.name === nameSec));

      const designOnly = await fetchAllAgents('design');
      assert.ok(designOnly.every((a) => a.category === 'design'));
      assert.ok(designOnly.some((a) => a.name === nameDesign));
      assert.ok(!designOnly.some((a) => a.name === nameSec));

      const secOnly = await fetchAllAgents('security');
      assert.ok(secOnly.every((a) => a.category === 'security'));
      assert.ok(secOnly.some((a) => a.name === nameSec));
    } finally {
      await removeAgent(nameDesign);
      await removeAgent(nameSec);
    }
  });
});
