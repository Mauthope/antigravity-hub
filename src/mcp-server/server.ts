import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb, initDb } from '../lib/db.js';
import { LicenseVerifier } from '../license/verifier.js';

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

export async function fetchAllAgents() {
  const sql = getDb();

  // 1. Try Neon Database first
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
    } catch (err) {
      console.warn('[MCP Server] Erro ao consultar Neon DB, usando arquivos locais:', err);
    }
  }

  // 2. Fallback to local files
  try {
    const dir = getAgentsDir();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    return files.map((fileName) => {
      try {
        const filePath = path.join(dir, fileName);
        const content = fs.readFileSync(filePath, 'utf-8');
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

export async function fetchAgentByName(name: string) {
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
      // fallback to local
    }
  }

  try {
    const dir = getAgentsDir();
    const filePath = path.join(dir, `${cleanName}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
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

export async function persistAgent(name: string, content: string, title?: string, license?: string, sourceUrl?: string) {
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
      console.warn('[MCP Server] Erro ao gravar no Neon:', err);
    }
  }

  try {
    const dir = getAgentsDir();
    fs.writeFileSync(path.join(dir, fileName), content, 'utf-8');
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

export async function removeAgent(name: string) {
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
    const filePath = path.join(dir, `${cleanName}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }

  return { success: true, message: `Agente '${cleanName}' removido.` };
}

export function createHubMcpServer() {
  const server = new McpServer({
    name: 'antigravity-hub',
    version: '1.0.0',
  });

  // TOOL 1: list_agents
  server.tool(
    'list_agents',
    'Lista todos os agentes salvos no Antigravity Hub com seus nomes, especialidades e orientações de uso.',
    {
      search: z.string().optional().describe('Termo de busca opcional para filtrar agentes por nome ou capacidade'),
    },
    async ({ search }) => {
      try {
        let list = await fetchAllAgents();
        if (search) {
          const q = search.toLowerCase();
          list = list.filter(
            (a: any) =>
              a.name.toLowerCase().includes(q) ||
              a.title.toLowerCase().includes(q) ||
              a.whatItDoes.toLowerCase().includes(q)
          );
        }

        if (list.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: search
                  ? `Nenhum agente encontrado correspondente a '${search}'.`
                  : 'Nenhum agente cadastrado no momento no Hub. Você pode salvar novos agentes com a ferramenta save_agent ou import_agent_github.',
              },
            ],
          };
        }

        const summary = list.map((a: any) => {
          return `• **${a.title}** (\`${a.name}\`)\n  - O que faz: ${a.whatItDoes}\n  - Quando usar: ${a.whenToUse}\n  - Armazenamento: ${a.storage}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `### Agentes Cadastrados no Antigravity Hub (${list.length} disponíveis):\n\n${summary}\n\nPara consultar as instruções completas de qualquer agente, use a ferramenta \`get_agent\` informando o nome correspondente.`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Erro ao listar agentes: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // TOOL 2: get_agent
  server.tool(
    'get_agent',
    'Obtém as instruções detalhadas, persona e diretrizes completas em markdown (.md) de um agente específico do Hub.',
    {
      name: z.string().describe('Nome ou identificador do agente (ex: meu-agente)'),
    },
    async ({ name }) => {
      try {
        const agent = await fetchAgentByName(name);
        if (!agent) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Agente '${name}' não foi encontrado no Antigravity Hub. Utilize 'list_agents' para visualizar todos os agentes disponíveis.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `# Instruções do Agente: ${agent.title} (\`${agent.name}\`)\nArmazenamento: ${agent.storage}\n\n${agent.content}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Erro ao buscar agente '${name}': ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // TOOL 3: save_agent
  server.tool(
    'save_agent',
    'Salva um novo agente em formato markdown (.md) no Antigravity Hub (persistido na nuvem Neon PostgreSQL).',
    {
      name: z.string().describe('Identificador do agente em minúsculas (kebab-case, ex: auditor-seguranca)'),
      content: z.string().describe('Conteúdo completo das instruções e diretrizes em markdown (.md)'),
      title: z.string().optional().describe('Título legível do agente (opcional)'),
      license: z.string().optional().describe('Licença do código (opcional, padrão MIT)'),
    },
    async ({ name, content, title, license }) => {
      try {
        const result = await persistAgent(name, content, title, license);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Agente '${result.name}' salvo com sucesso!\n- Título: ${result.title}\n- Arquivo: ${result.fileName}\n- Armazenamento: ${result.savedIn}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Erro ao salvar agente: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // TOOL 4: import_agent_github
  server.tool(
    'import_agent_github',
    'Importa um agente do GitHub realizando auditoria rigorosa de licença (APENAS MIT ou Apache-2.0, 0% risco legal). Bloqueia qualquer licença incompatível.',
    {
      url: z.string().describe('URL do repositório ou pasta no GitHub (ex: https://github.com/owner/repo)'),
    },
    async ({ url }) => {
      try {
        const cleanUrl = url.trim();
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) || cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
        if (!match) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'URL do GitHub inválida. Informe uma URL no formato https://github.com/owner/repo.' }],
          };
        }

        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');

        // 1. Auditoria Estrita de Licenças (0% Risco Jurídico)
        const licenseAudit = await LicenseVerifier.verifyRepo(owner, repo);
        if (!licenseAudit.valid) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `🛑 BLOQUEADO (0% Risco Legal): ${licenseAudit.error || 'O repositório não possui licença permissiva MIT ou Apache-2.0 autorizada.'}`,
              },
            ],
          };
        }

        // 2. Busca do arquivo markdown
        const candidates = ['SKILL.md', 'agent.md', 'AGENTS.md', 'agents.md', 'README.md'];
        let foundContent = '';
        let foundFileName = 'agent.md';

        for (const b of ['main', 'master']) {
          for (const cand of candidates) {
            try {
              const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${cand}`;
              const res = await fetch(rawUrl, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
              if (res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 30) {
                  foundContent = text;
                  foundFileName = cand;
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
          return {
            isError: true,
            content: [{ type: 'text', text: `Nenhum arquivo markdown de agente (SKILL.md, agent.md, README.md) encontrado no repositório ${owner}/${repo}.` }],
          };
        }

        const agentName = repo.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const details = parseAgentDetails(foundContent, agentName);

        const saved = await persistAgent(agentName, foundContent, details.title, licenseAudit.spdxId || licenseAudit.license, cleanUrl);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Agente importado com sucesso do GitHub!\n- Nome: ${saved.name}\n- Título: ${saved.title}\n- Licença Auditada: ${licenseAudit.license} (${licenseAudit.spdxId}) — APROVADO\n- Armazenamento: ${saved.savedIn}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Erro ao importar do GitHub: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // TOOL 5: delete_agent
  server.tool(
    'delete_agent',
    'Remove um agente do Antigravity Hub.',
    {
      name: z.string().describe('Nome do agente a ser removido'),
    },
    async ({ name }) => {
      try {
        const result = await removeAgent(name);
        return {
          content: [{ type: 'text', text: result.message }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Erro ao excluir agente: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // PROMPT: consult_agent
  server.prompt(
    'consult_agent',
    'Consulta um agente específico para atuar sobre uma tarefa com base em suas instruções completas.',
    {
      agent_name: z.string().describe('Nome do agente a consultar'),
      task: z.string().describe('Descrição da tarefa ou pedido para o agente resolver'),
    },
    async ({ agent_name, task }) => {
      const agent = await fetchAgentByName(agent_name);
      const instructions = agent ? agent.content : `(Agente ${agent_name} não encontrado no catálogo)`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Você deve atuar estritamente como o agente **${agent?.title || agent_name}** seguindo as instruções abaixo:\n\n---\n${instructions}\n---\n\nTarefa a executar:\n${task}`,
            },
          },
        ],
      };
    }
  );

  // RESOURCE: agents://{name}
  server.resource(
    'agent_markdown',
    new ResourceTemplate('agents://{name}', { list: undefined }),
    async (uri, { name }) => {
      const agent = await fetchAgentByName(String(name));
      if (!agent) {
        throw new Error(`Agente '${name}' não encontrado.`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            text: agent.content,
            mimeType: 'text/markdown',
          },
        ],
      };
    }
  );

  return server;
}
