import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb, initDb } from '@/lib/db';
import { LicenseVerifier } from '@/license/verifier';

function getAgentsDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'agents');
  }

  const localDir = path.join(process.cwd(), 'agents');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    return path.join(os.tmpdir(), 'agents');
  }
}

function parseAgentDetails(content: string, name: string) {
  const titleMatch = content.match(/^#+\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\(`.*`\)/, '').trim() : name;

  const whatMatch = content.match(/##\s*O Que Este Agente Faz\s*([\s\S]*?)(?=\n##|$)/i);
  let whatItDoes = '';
  if (whatMatch) {
    whatItDoes = whatMatch[1].trim();
  } else {
    const fmDesc = content.match(/description:\s*(.+)/i);
    if (fmDesc) {
      whatItDoes = fmDesc[1].trim();
    } else {
      const pMatch = content.match(/^#+.*\n+([^#\n]+)/m);
      whatItDoes = pMatch ? pMatch[1].trim() : 'Agente especializado pronto para execução de tarefas no chat.';
    }
  }

  const whenMatch = content.match(/##\s*Quando Usar\s*([\s\S]*?)(?=\n##|$)/i);
  const whenToUse = whenMatch
    ? whenMatch[1].trim()
    : 'Invoque no chat quando precisar de auxílio especializado nesta área.';

  return { title, whatItDoes, whenToUse };
}

async function fetchAllAgents() {
  const sql = getDb();
  if (sql) {
    try {
      await initDb();
      const rows = await sql`
        SELECT name, title, content, file_name, source_url, license, created_at, updated_at
        FROM agents
        ORDER BY id DESC;
      `;

      return (rows || []).map((r) => {
        const details = parseAgentDetails(r.content, r.name);
        return {
          name: r.name,
          fileName: r.file_name,
          title: r.title || details.title,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          content: r.content,
          sourceUrl: r.source_url || undefined,
          license: r.license || 'Proprietária / Pessoal',
          storage: 'Neon PostgreSQL (agents_mpg)',
        };
      });
    } catch {
      // ignore
    }
  }

  try {
    const dir = getAgentsDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    return files.map((fileName) => {
      try {
        const filePath = path.join(/*turbopackIgnore: true*/ dir, fileName);
        const content = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8');
        const name = fileName.replace(/\.md$/, '');
        const details = parseAgentDetails(content, name);
        return {
          name,
          fileName,
          title: details.title,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          content,
          storage: 'Arquivo Local',
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchAgentByName(name: string) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '');
  const sql = getDb();

  if (sql) {
    try {
      await initDb();
      const rows = await sql`
        SELECT name, title, content, file_name, source_url, license
        FROM agents
        WHERE name = ${cleanName}
        LIMIT 1;
      `;
      if (rows && rows.length > 0) {
        const r = rows[0];
        const details = parseAgentDetails(r.content, r.name);
        return {
          name: r.name,
          fileName: r.file_name,
          title: r.title || details.title,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          content: r.content,
          license: r.license,
          storage: 'Neon PostgreSQL',
        };
      }
    } catch {
      // ignore
    }
  }

  try {
    const dir = getAgentsDir();
    const filePath = path.join(/*turbopackIgnore: true*/ dir, `${cleanName}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8');
      const details = parseAgentDetails(content, cleanName);
      return {
        name: cleanName,
        fileName: `${cleanName}.md`,
        title: details.title,
        whatItDoes: details.whatItDoes,
        whenToUse: details.whenToUse,
        content,
        storage: 'Arquivo Local',
      };
    }
  } catch {
    // ignore
  }

  return null;
}

async function persistAgent(name: string, content: string, title?: string, license?: string, sourceUrl?: string) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '') || 'custom-agent';
  const fileName = `${cleanName}.md`;
  const details = parseAgentDetails(content, cleanName);
  const finalTitle = title || details.title;

  const sql = getDb();
  let savedInNeon = false;

  if (sql) {
    try {
      await initDb();
      await sql`
        INSERT INTO agents (name, title, content, file_name, source_url, license, updated_at)
        VALUES (${cleanName}, ${finalTitle}, ${content}, ${fileName}, ${sourceUrl || null}, ${license || null}, CURRENT_TIMESTAMP)
        ON CONFLICT (name) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          file_name = EXCLUDED.file_name,
          source_url = EXCLUDED.source_url,
          license = EXCLUDED.license,
          updated_at = CURRENT_TIMESTAMP;
      `;
      savedInNeon = true;
    } catch (err) {
      console.warn('[MCP Route] Erro ao gravar no Neon:', err);
    }
  }

  try {
    const dir = getAgentsDir();
    fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, fileName), content, 'utf-8');
  } catch {
    // ignore
  }

  return {
    name: cleanName,
    fileName,
    title: finalTitle,
    savedIn: savedInNeon ? 'Neon PostgreSQL (agents_mpg)' : 'Local File',
  };
}

async function removeAgent(name: string) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const sql = getDb();

  if (sql) {
    try {
      await initDb();
      await sql`DELETE FROM agents WHERE name = ${cleanName};`;
    } catch {
      // ignore
    }
  }

  try {
    const dir = getAgentsDir();
    const filePath = path.join(/*turbopackIgnore: true*/ dir, `${cleanName}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }

  return { success: true, message: `Agente '${cleanName}' removido.` };
}

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    name: 'antigravity-hub',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    description: 'Servidor MCP Oficial do Antigravity Hub para gerenciamento e invocação de agentes em chat',
    capabilities: {
      tools: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
    },
    tools: [
      {
        name: 'list_agents',
        description: 'Lista todos os agentes disponíveis no Antigravity Hub com nomes, títulos, resumos de atuação e tags.',
        inputSchema: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Termo de busca opcional para filtrar agentes por nome ou capacidade',
            },
          },
        },
      },
      {
        name: 'get_agent',
        description: 'Obtém as diretrizes, persona e instruções completas em markdown (.md) de um agente específico para executar uma tarefa.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome ou identificador do agente (ex: meu-agente)',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'save_agent',
        description: 'Salva um novo agente em formato markdown (.md) no Antigravity Hub (persistido no Neon PostgreSQL).',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Identificador do agente em minúsculas (kebab-case)',
            },
            content: {
              type: 'string',
              description: 'Conteúdo markdown (.md) completo das instruções do agente',
            },
            title: {
              type: 'string',
              description: 'Título legível do agente (opcional)',
            },
            license: {
              type: 'string',
              description: 'Licença do agente (opcional, padrão MIT)',
            },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'import_agent_github',
        description: 'Audita licença (apenas MIT ou Apache-2.0, 0% risco legal) e importa agente do GitHub.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL do repositório no GitHub (ex: https://github.com/owner/repo)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'delete_agent',
        description: 'Remove um agente do Antigravity Hub.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome do agente a remover',
            },
          },
          required: ['name'],
        },
      },
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id = 1, method, params } = body;

    // Handle MCP protocol methods
    switch (method) {
      case 'initialize': {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            serverInfo: {
              name: 'antigravity-hub',
              version: '1.0.0',
            },
          },
        });
      }

      case 'tools/list': {
        const manifest = await (await GET()).json();
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: manifest.tools,
          },
        });
      }

      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};

        if (toolName === 'list_agents') {
          let list = await fetchAllAgents();
          if (args.search) {
            const q = args.search.toLowerCase();
            list = list.filter(
              (a: any) =>
                a.name.toLowerCase().includes(q) ||
                a.title.toLowerCase().includes(q) ||
                a.whatItDoes.toLowerCase().includes(q)
            );
          }

          if (list.length === 0) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: 'Nenhum agente cadastrado no momento no Hub.' }],
              },
            });
          }

          const summary = list.map((a: any) => {
            return `• **${a.title}** (\`${a.name}\`)\n  - O que faz: ${a.whatItDoes}\n  - Quando usar: ${a.whenToUse}\n  - Armazenamento: ${a.storage}`;
          }).join('\n\n');

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `### Agentes no Antigravity Hub (${list.length} disponíveis):\n\n${summary}\n\nUse \`get_agent\` com o nome para obter as instruções completas.`,
              }],
            },
          });
        }

        if (toolName === 'get_agent') {
          const agent = await fetchAgentByName(args.name);
          if (!agent) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Agente '${args.name}' não encontrado no Hub.` }],
              },
            });
          }

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `# Instruções do Agente: ${agent.title} (\`${agent.name}\`)\nArmazenamento: ${agent.storage}\n\n${agent.content}`,
              }],
            },
          });
        }

        if (toolName === 'save_agent') {
          const saved = await persistAgent(args.name, args.content, args.title, args.license);
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `✅ Agente '${saved.name}' salvo com sucesso!\n- Título: ${saved.title}\n- Armazenamento: ${saved.savedIn}`,
              }],
            },
          });
        }

        if (toolName === 'import_agent_github') {
          const cleanUrl = (args.url || '').trim();
          const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) || cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
          if (!match) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: 'URL do GitHub inválida.' }],
              },
            });
          }

          const owner = match[1];
          const repo = match[2].replace(/\.git$/, '');

          const licenseAudit = await LicenseVerifier.verifyRepo(owner, repo);
          if (!licenseAudit.valid) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `🛑 BLOQUEADO: ${licenseAudit.error || 'Licença não permitida. Apenas MIT e Apache-2.0 são autorizadas.'}` }],
              },
            });
          }

          const candidates = ['SKILL.md', 'agent.md', 'AGENTS.md', 'agents.md', 'README.md'];
          let foundContent = '';
          for (const b of ['main', 'master']) {
            for (const cand of candidates) {
              try {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${cand}`;
                const res = await fetch(rawUrl, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
                if (res.ok) {
                  const text = await res.text();
                  if (text && text.trim().length > 30) {
                    foundContent = text;
                    break;
                  }
                }
              } catch {
                // continue
              }
            }
            if (foundContent) break;
          }

          if (!foundContent) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Nenhum arquivo markdown de agente encontrado em ${owner}/${repo}.` }],
              },
            });
          }

          const agentName = repo.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          const saved = await persistAgent(agentName, foundContent, undefined, licenseAudit.spdxId || licenseAudit.license, cleanUrl);

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `✅ Agente '${saved.name}' importado com sucesso!\n- Licença Auditada: ${licenseAudit.license} (Aprovado MIT/Apache-2.0)\n- Armazenamento: ${saved.savedIn}`,
              }],
            },
          });
        }

        if (toolName === 'delete_agent') {
          const result = await removeAgent(args.name);
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.message }],
            },
          });
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Ferramenta desconhecida: ${toolName}`,
          },
        });
      }

      default: {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Método não suportado: ${method}`,
          },
        });
      }
    }
  } catch (err) {
    return NextResponse.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `Erro interno no servidor MCP: ${err instanceof Error ? err.message : String(err)}`,
      },
    }, { status: 500 });
  }
}
