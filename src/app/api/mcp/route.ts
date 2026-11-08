import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { neon } from '@neondatabase/serverless';
import {
  initDb,
  parseAgentDetails,
  resolveDatabaseEnv,
  upsertAgentInDb,
} from '@/lib/db';
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

async function fetchAllAgents() {
  const resolved = resolveDatabaseEnv();
  if (resolved) {
    await initDb();
    const sql = neon(resolved.connectionString);
    const rows = await sql`
      SELECT name, title, content, file_name, source_url, license, created_at, updated_at
      FROM agents
      ORDER BY id DESC;
    `;

    return (rows || []).map((r) => {
      const details = parseAgentDetails(String(r.content), String(r.name));
      return {
        name: String(r.name),
        fileName: String(r.file_name),
        title: String(r.title || details.title),
        whatItDoes: details.whatItDoes,
        whenToUse: details.whenToUse,
        content: String(r.content),
        sourceUrl: r.source_url ? String(r.source_url) : undefined,
        license: r.license ? String(r.license) : 'Proprietaria / Pessoal',
        storage: `Neon PostgreSQL (${resolved.databaseName})`,
      };
    });
  }

  try {
    const dir = getAgentsDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    return files
      .map((fileName) => {
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
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchAgentByName(name: string) {
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-|-$/g, '');
  const resolved = resolveDatabaseEnv();

  if (resolved) {
    await initDb();
    const sql = neon(resolved.connectionString);
    const rows = await sql`
      SELECT name, title, content, file_name, source_url, license
      FROM agents
      WHERE name = ${cleanName}
      LIMIT 1;
    `;
    if (rows && rows.length > 0) {
      const r = rows[0];
      const details = parseAgentDetails(String(r.content), String(r.name));
      return {
        name: String(r.name),
        fileName: String(r.file_name),
        title: String(r.title || details.title),
        whatItDoes: details.whatItDoes,
        whenToUse: details.whenToUse,
        content: String(r.content),
        license: r.license ? String(r.license) : undefined,
        storage: `Neon PostgreSQL (${resolved.databaseName})`,
      };
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

async function persistAgent(
  name: string,
  content: string,
  title?: string,
  license?: string,
  sourceUrl?: string
) {
  const cleanName =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-|-$/g, '') || 'custom-agent';
  const fileName = `${cleanName}.md`;
  const details = parseAgentDetails(content, cleanName);
  const finalTitle = title || details.title;

  const resolved = resolveDatabaseEnv();
  let savedInNeon = false;

  if (resolved) {
    await upsertAgentInDb({
      name: cleanName,
      title: finalTitle,
      content,
      fileName,
      sourceUrl: sourceUrl || null,
      license: license || null,
    });
    savedInNeon = true;
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
    savedInNeon,
    savedIn: savedInNeon
      ? `Neon PostgreSQL (${resolved!.databaseName})`
      : 'Arquivo Local (DATABASE_URL nao configurada)',
  };
}

async function removeAgent(name: string) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const resolved = resolveDatabaseEnv();

  if (resolved) {
    await initDb();
    const sql = neon(resolved.connectionString);
    await sql`DELETE FROM agents WHERE name = ${cleanName};`;
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
    description:
      'Servidor MCP Oficial do Antigravity Hub para gerenciamento e invocacao de agentes em chat',
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
        description:
          'Lista todos os agentes disponiveis no Antigravity Hub com nomes, titulos, resumos de atuacao e tags.',
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
        description:
          'Obtem as diretrizes, persona e instrucoes completas em markdown (.md) de um agente especifico para executar uma tarefa.',
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
        description:
          'Salva um novo agente em formato markdown (.md) no Antigravity Hub (persistido no Neon PostgreSQL).',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Identificador do agente em minusculas (kebab-case)',
            },
            content: {
              type: 'string',
              description: 'Conteudo markdown (.md) completo das instrucoes do agente',
            },
            title: {
              type: 'string',
              description: 'Titulo legivel do agente (opcional)',
            },
            license: {
              type: 'string',
              description: 'Licenca do agente (opcional, padrao MIT)',
            },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'import_agent_github',
        description:
          'Audita licenca (apenas MIT ou Apache-2.0, 0% risco legal) e importa agente do GitHub.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL do repositorio no GitHub (ex: https://github.com/owner/repo)',
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
            const q = String(args.search).toLowerCase();
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

          const summary = list
            .map((a: any) => {
              return `- **${a.title}** (\`${a.name}\`)\n  - O que faz: ${a.whatItDoes}\n  - Quando usar: ${a.whenToUse}\n  - Armazenamento: ${a.storage}`;
            })
            .join('\n\n');

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `### Agentes no Antigravity Hub (${list.length} disponiveis):\n\n${summary}\n\nUse \`get_agent\` com o nome para obter as instrucoes completas.`,
                },
              ],
            },
          });
        }

        if (toolName === 'get_agent') {
          const agent = await fetchAgentByName(String(args.name || ''));
          if (!agent) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Agente '${args.name}' nao encontrado no Hub.` }],
              },
            });
          }

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `# Instrucoes do Agente: ${agent.title} (\`${agent.name}\`)\nArmazenamento: ${agent.storage}\n\n${agent.content}`,
                },
              ],
            },
          });
        }

        if (toolName === 'save_agent') {
          const saved = await persistAgent(
            String(args.name || ''),
            String(args.content || ''),
            args.title ? String(args.title) : undefined,
            args.license ? String(args.license) : undefined
          );
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `[OK] Agente '${saved.name}' salvo com sucesso!\n- Titulo: ${saved.title}\n- Armazenamento: ${saved.savedIn}`,
                },
              ],
            },
          });
        }

        if (toolName === 'import_agent_github') {
          const cleanUrl = String(args.url || '').trim();
          const match =
            cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) ||
            cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
          if (!match) {
            return NextResponse.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: 'URL do GitHub invalida.' }],
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
                content: [
                  {
                    type: 'text',
                    text: `[BLOQUEADO]: ${
                      licenseAudit.error ||
                      'Licenca nao permitida. Apenas MIT e Apache-2.0 sao autorizadas.'
                    }`,
                  },
                ],
              },
            });
          }

          const candidates = ['SKILL.md', 'agent.md', 'AGENTS.md', 'agents.md', 'README.md'];
          let foundContent = '';
          for (const b of ['main', 'master']) {
            for (const cand of candidates) {
              try {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${cand}`;
                const res = await fetch(rawUrl, {
                  headers: { 'User-Agent': 'Antigravity-Hub/1.0' },
                });
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
                content: [
                  {
                    type: 'text',
                    text: `Nenhum arquivo markdown de agente encontrado em ${owner}/${repo}.`,
                  },
                ],
              },
            });
          }

          const agentName = repo.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          const saved = await persistAgent(
            agentName,
            foundContent,
            undefined,
            licenseAudit.spdxId || licenseAudit.license,
            cleanUrl
          );

          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `[OK] Agente '${saved.name}' importado com sucesso!\n- Licenca Auditada: ${licenseAudit.license} (Aprovado MIT/Apache-2.0)\n- Armazenamento: ${saved.savedIn}`,
                },
              ],
            },
          });
        }

        if (toolName === 'delete_agent') {
          const result = await removeAgent(String(args.name || ''));
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
            message: `Metodo nao suportado: ${method}`,
          },
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Erro interno no servidor MCP: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      },
      { status: 500 }
    );
  }
}
