import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAgentCategory,
  parseAgentDetails,
  loadBundledAgentsFromRepo,
  updateMarkdownFrontmatterCategory,
} from '../dist/lib/db.js';
import {
  fetchAllAgents,
  fetchAgentByName,
  persistAgent,
  removeAgent,
  updateAgentCategory,
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

  test('Agente oficial "start" deve estar presente no catálogo com os 6 requisitos obrigatórios', async () => {
    const bundled = loadBundledAgentsFromRepo();
    const startBundled = bundled.find((a) => a.name === 'start');
    assert.ok(startBundled, 'Agente start deve existir em agents/start.md');
    assert.equal(startBundled.category, 'orchestration');

    const startMcp = await fetchAgentByName('start');
    assert.ok(startMcp, 'Agente start deve ser retornável pelo MCP Server');
    assert.equal(startMcp.category, 'orchestration');

    // Valida presença das diretrizes obrigatórias no prompt
    assert.ok(startMcp.content.includes('Puxar o Escopo'), 'Deve puxar o escopo');
    assert.ok(startMcp.content.includes('Agente de Designer'), 'Deve pedir escolha do Agente de Designer');
    assert.ok(startMcp.content.includes('Multi-Tenant'), 'Deve arquitetar sistema Multi-Tenant');
    assert.ok(startMcp.content.includes('tenant_id'), 'Deve incluir modelagem tenant_id');
    assert.ok(startMcp.content.includes('Next.js') && startMcp.content.includes('Tailwind CSS'), 'Deve usar Next.js + Tailwind CSS');
    assert.ok(startMcp.content.includes('100% Responsiv'), 'Deve exigir 100% de responsividade');
    assert.ok(startMcp.content.includes('GitHub'), 'Deve criar novo repositório no GitHub');
    assert.ok(startMcp.content.includes('DATABASE_URL') && startMcp.content.includes('NEXT_PUBLIC_SUPABASE_URL'), 'Deve entregar variáveis da Vercel para Neon e Supabase');
  });

  test('Agente oficial "designer-akiom" deve estar disponível na categoria "design" para seleção pelo start', async () => {
    const designAgents = await fetchAllAgents('design');
    assert.ok(
      designAgents.some((a) => a.name === 'designer-akiom'),
      'designer-akiom deve estar listado na categoria design'
    );
  });

  test('updateMarkdownFrontmatterCategory deve atualizar ou injetar a categoria no markdown', () => {
    const original = `---\nname: my-agent\nlicense: MIT\n---\n# My Agent`;
    const updated = updateMarkdownFrontmatterCategory(original, 'security');
    assert.ok(updated.includes('category: security'));
    assert.ok(updated.includes('license: MIT'));

    const existingCat = `---\nname: test\ncategory: general\n---\n# Test`;
    const reclassified = updateMarkdownFrontmatterCategory(existingCat, 'data');
    assert.ok(reclassified.includes('category: data'));
    assert.ok(!reclassified.includes('category: general'));
  });

  test('Deve permitir mover um agente existente para outra categoria via updateAgentCategory', async () => {
    const tempName = 'test-movable-agent';
    await persistAgent(tempName, '# Agente Temporario\nInicial em Geral', 'Agente Temporario', 'MIT', undefined, 'general');

    try {
      const initial = await fetchAgentByName(tempName);
      assert.ok(initial);
      assert.equal(initial.category, 'general');

      // Move para categoria 'security'
      const moved = await updateAgentCategory(tempName, 'security');
      assert.equal(moved.category, 'security');

      const afterMove = await fetchAgentByName(tempName);
      assert.ok(afterMove);
      assert.equal(afterMove.category, 'security');

      // Move para categoria 'architecture'
      await updateAgentCategory(tempName, 'architecture');
      const afterSecondMove = await fetchAgentByName(tempName);
      assert.ok(afterSecondMove);
      assert.equal(afterSecondMove.category, 'architecture');
    } finally {
      await removeAgent(tempName);
    }
  });
});


