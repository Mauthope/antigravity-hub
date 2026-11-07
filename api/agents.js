// Vercel Serverless Function: Agents Registry & Generator
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const defaultAgents = [
    {
      name: 'code-reviewer',
      role: 'Senior Code Reviewer',
      description: 'Especialista em revisão minuciosa de código, boas práticas e segurança',
      system_prompt: 'Você é um revisor de código sênior de nível Staff. Seu foco é garantir excelência técnica, clean code, prevenção de bugs e segurança rigorosa em cada PR ou arquivo analisado.',
      tools: { write: true, subagents: true, mcp: true },
      skills: ['github'],
      mcp_servers: [],
      chatCommand: '/code-reviewer',
    },
    {
      name: 'architect',
      role: 'Cloud & Software Architect',
      description: 'Arquiteto de sistemas especializado em microsserviços, escalabilidade e arquitetura limpa',
      system_prompt: 'Você é um arquiteto de software sênior. Avalie trade-offs, escalabilidade, desacoplamento, resiliência e padrões de projeto limpos.',
      tools: { write: true, subagents: true, mcp: true },
      skills: ['github'],
      mcp_servers: ['sqlite'],
      chatCommand: '/architect',
    },
    {
      name: 'ag-hub',
      role: 'Antigravity Hub Specialist',
      description: 'Orquestrador do ecossistema: gerencia agentes, importa skills do GitHub e conecta servidores MCP',
      system_prompt: 'Você é o especialista do Antigravity Hub. Auxilie na orquestração de subagentes, importação de skills do GitHub (somente MIT e Apache-2.0) e configuração de MCP.',
      tools: { write: true, subagents: true, mcp: true },
      skills: ['ag-hub'],
      mcp_servers: ['fetch', 'sqlite'],
      chatCommand: '/ag-hub',
    },
  ];

  if (req.method === 'GET') {
    return res.status(200).json({ agents: defaultAgents });
  }

  if (req.method === 'POST') {
    const { name, role, description, system_prompt, tools, mcp_servers, skills } = req.body || {};

    if (!name || !role || !system_prompt) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: name, role, system_prompt' });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const mcpText = mcp_servers && mcp_servers.length ? mcp_servers.join(', ') : 'Nenhum';
    const skillsText = skills && skills.length ? skills.join(', ') : 'Habilidades padrão';

    const skillContent = `---
name: ${cleanName}
description: Ativa o agente especializado '${role}' (${description || role}). Invoque digitando /${cleanName} ou solicitando no chat.
---

# Agente: ${role} (\`${cleanName}\`)

Você foi invocado para atuar diretamente como o agente especialista **${role}**.
Assuma imediatamente as diretrizes, tom, postura e capacidades definidas abaixo.

## 🎯 Descrição do Papel
${description || role}

## 🧠 Instruções de Sistema e Diretrizes Operacionais
${system_prompt}

## 🛠️ Ferramentas & Conexões
- **Permissão de escrita / modificação de código**: ${tools?.write ? 'Sim (Total)' : 'Não'}
- **Permissão para delegar a subagentes**: ${tools?.subagents ? 'Sim' : 'Não'}
- **Acesso a ferramentas MCP**: ${tools?.mcp ? 'Sim' : 'Não'}
- **Habilidades associadas**: ${skillsText}
- **Servidores MCP conectados**: ${mcpText}

## 💬 Comportamento de Inicialização
Ao ser acionado pelo usuário:
1. Cumprimente o usuário informando brevemente que o agente **${role}** está ativo e pronto.
2. Foque imediatamente na demanda do usuário com o rigor técnico e abordagem descritos em suas diretrizes.
`;

    return res.status(201).json({
      success: true,
      agent: {
        name: cleanName,
        role,
        description,
        system_prompt,
        chatCommand: `/${cleanName}`,
        skillMd: skillContent,
      },
    });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
