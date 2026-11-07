import { NextResponse } from 'next/server';

const DEFAULT_AGENTS = [
  {
    name: 'code-reviewer',
    role: 'Senior Code Reviewer',
    description: 'Especialista em revisão minuciosa de código, boas práticas e segurança',
    system_prompt: 'Você é um revisor de código sênior de nível Staff. Seu foco é garantir excelência técnica, clean code, prevenção de bugs e segurança rigorosa em cada PR ou arquivo analisado.',
    tools: { write: true, subagents: true, mcp: true },
    skills: ['github'],
    mcp_servers: [],
    chatCommand: '/code-reviewer',
    badge: 'Global',
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
    badge: 'Global',
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
    badge: 'Global',
  },
];

export async function GET() {
  return NextResponse.json({ agents: DEFAULT_AGENTS });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, role, description, system_prompt, tools, mcp_servers, skills } = body;

    if (!name || !role || !system_prompt) {
      return NextResponse.json(
        { error: 'Campos obrigatórios ausentes: name, role, system_prompt' },
        { status: 400 }
      );
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

    return NextResponse.json({
      success: true,
      agent: {
        name: cleanName,
        role,
        description: description || role,
        system_prompt,
        chatCommand: `/${cleanName}`,
        badge: 'Global',
        skillMd: skillContent,
      },
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar criação de agente' },
      { status: 500 }
    );
  }
}
