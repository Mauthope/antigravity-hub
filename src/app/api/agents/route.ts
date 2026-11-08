import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { neon } from '@neondatabase/serverless';
import {
  initDb,
  parseAgentDetails,
  detectAgentCategory,
  resolveDatabaseEnv,
  upsertAgentInDb,
} from '@/lib/db';
import { AGENT_CATEGORIES } from '@/types';

export const dynamic = 'force-dynamic';

export { parseAgentDetails, detectAgentCategory, AGENT_CATEGORIES };

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

function ensureAgentsDir(): string {
  const dir = getAgentsDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // ignore
  }
  return dir;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryFilter = searchParams.get('category');
  const searchQuery = searchParams.get('q')?.toLowerCase();

  const resolved = resolveDatabaseEnv();
  let dbError: string | undefined;

  // 1. Try Neon Database first when configured
  if (resolved) {
    try {
      await initDb();
      const sql = neon(resolved.connectionString);
      const rows = await sql`
        SELECT id, name, title, content, file_name, category, source_url, license, created_at, updated_at
        FROM agents
        ORDER BY id DESC;
      `;

      let allAgents = (rows || []).map((r) => {
        const details = parseAgentDetails(
          String(r.content),
          String(r.name),
          r.category ? String(r.category) : undefined
        );
        const category = String(r.category || details.category || 'general');
        return {
          id: r.id,
          name: r.name,
          fileName: r.file_name,
          title: r.title || details.title,
          category,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          tags: details.tags,
          content: r.content,
          chatCommand: `/${r.name}`,
          sourceUrl: r.source_url,
          license: r.license,
          database: 'Neon PostgreSQL',
        };
      });

      // Contagem por categoria antes do filtro
      const categoryCounts: Record<string, number> = { all: allAgents.length };
      for (const cat of AGENT_CATEGORIES) {
        categoryCounts[cat.id] = allAgents.filter((a) => a.category === cat.id).length;
      }

      let filtered = allAgents;
      if (categoryFilter && categoryFilter !== 'all') {
        filtered = filtered.filter((a) => a.category === categoryFilter);
      }
      if (searchQuery) {
        filtered = filtered.filter(
          (a) =>
            a.name.toLowerCase().includes(searchQuery) ||
            a.title.toLowerCase().includes(searchQuery) ||
            a.whatItDoes.toLowerCase().includes(searchQuery) ||
            a.category.toLowerCase().includes(searchQuery)
        );
      }

      return NextResponse.json(
        {
          agents: filtered,
          allCount: allAgents.length,
          categories: AGENT_CATEGORIES,
          categoryCounts,
          databaseConnected: true,
          databaseConfigured: true,
          dbMeta: {
            envVarName: resolved.envVarName,
            host: resolved.host,
            databaseName: resolved.databaseName,
          },
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
      console.error('[GET /api/agents] Erro real ao consultar Neon DB:', dbError);
    }
  }

  // 2. Fallback to local files in agents/ (with databaseConnected strictly false!)
  try {
    const dir = ensureAgentsDir();
    let allAgents: any[] = [];

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      allAgents = files
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
              category: details.category,
              whatItDoes: details.whatItDoes,
              whenToUse: details.whenToUse,
              tags: details.tags,
              content,
              chatCommand: `/${name}`,
              database: 'Cache Local',
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    const categoryCounts: Record<string, number> = { all: allAgents.length };
    for (const cat of AGENT_CATEGORIES) {
      categoryCounts[cat.id] = allAgents.filter((a) => a.category === cat.id).length;
    }

    let filtered = allAgents;
    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter((a) => a.category === categoryFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery) ||
          a.title.toLowerCase().includes(searchQuery) ||
          a.whatItDoes.toLowerCase().includes(searchQuery) ||
          a.category.toLowerCase().includes(searchQuery)
      );
    }

    return NextResponse.json(
      {
        agents: filtered,
        allCount: allAgents.length,
        categories: AGENT_CATEGORIES,
        categoryCounts,
        databaseConnected: false,
        databaseConfigured: Boolean(resolved),
        dbError,
        dbMeta: resolved
          ? {
              envVarName: resolved.envVarName,
              host: resolved.host,
              databaseName: resolved.databaseName,
            }
          : undefined,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json(
      {
        agents: [],
        allCount: 0,
        categories: AGENT_CATEGORIES,
        categoryCounts: { all: 0 },
        databaseConnected: false,
        databaseConfigured: Boolean(resolved),
        dbError,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resolved = resolveDatabaseEnv();

    // Suporte a sincronização em lote (ex: agentes que estavam apenas no localStorage do navegador)
    if (Array.isArray(body.agents)) {
      if (!resolved) {
        return NextResponse.json(
          {
            error:
              'Variável de conexão com o Neon (DATABASE_URL) ainda não está configurada neste ambiente.',
          },
          { status: 400 }
        );
      }

      const syncedAgents = [];
      for (const item of body.agents) {
        if (!item?.name || !item?.content) continue;
        const cleanName =
          String(item.name)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/^-|-$/g, '') || 'custom-agent';
        const fileName = `${cleanName}.md`;
        const details = parseAgentDetails(String(item.content), cleanName, item.category);
        const category = item.category || details.category;

        const { row } = await upsertAgentInDb({
          name: cleanName,
          title: item.title || details.title,
          content: String(item.content),
          fileName,
          category,
          sourceUrl: item.sourceUrl || null,
          license: item.license || null,
        });

        syncedAgents.push({
          id: row.id,
          name: row.name,
          fileName: row.file_name,
          title: row.title || details.title,
          category: row.category || category,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          tags: details.tags,
          chatCommand: `/${row.name}`,
          content: row.content,
          sourceUrl: row.source_url,
          license: row.license,
          database: 'Neon PostgreSQL',
        });
      }

      return NextResponse.json({
        success: true,
        savedInNeon: true,
        syncedCount: syncedAgents.length,
        agents: syncedAgents,
      });
    }

    const { name, content, category: reqCategory, sourceUrl, license } = body;

    if (!name || !content) {
      return NextResponse.json(
        { error: 'Nome e conteúdo (.md) são obrigatórios' },
        { status: 400 }
      );
    }

    const cleanName =
      String(name)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/^-|-$/g, '') || 'custom-agent';
    const fileName = `${cleanName}.md`;
    const details = parseAgentDetails(String(content), cleanName, reqCategory);
    const category = reqCategory || details.category;

    let savedInNeon = false;
    let dbRowId: number | undefined;

    // 1. Se houver variável do Neon configurada, grava obrigatoriamente e propaga qualquer erro real!
    if (resolved) {
      try {
        const { row } = await upsertAgentInDb({
          name: cleanName,
          title: details.title,
          content: String(content),
          fileName,
          category,
          sourceUrl: sourceUrl || null,
          license: license || null,
        });
        savedInNeon = true;
        dbRowId = row.id;
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error('[POST /api/agents] Falha ao gravar no Neon PostgreSQL:', msg);
        return NextResponse.json(
          {
            error: `Falha ao gravar na tabela 'agents' do Neon (${resolved.envVarName} -> ${resolved.host}/${resolved.databaseName}): ${msg}`,
            dbConfigured: true,
            savedInNeon: false,
          },
          { status: 500 }
        );
      }
    }

    // 2. Também grava em arquivo local quando aplicável (desenvolvimento local)
    try {
      const dir = ensureAgentsDir();
      const filePath = path.join(/*turbopackIgnore: true*/ dir, fileName);
      fs.writeFileSync(/*turbopackIgnore: true*/ filePath, String(content), 'utf-8');
    } catch {
      // ignore em disco somente leitura
    }

    return NextResponse.json(
      {
        success: true,
        savedInNeon,
        savedIn: savedInNeon ? 'Neon PostgreSQL' : 'Cache Local',
        warning: !savedInNeon
          ? 'DATABASE_URL não configurada no servidor. O agente foi salvo apenas localmente no navegador e a tabela no Neon permanecerá vazia até conectar a variável na Vercel e fazer Redeploy.'
          : undefined,
        agent: {
          id: dbRowId,
          name: cleanName,
          fileName,
          title: details.title,
          category,
          whatItDoes: details.whatItDoes,
          whenToUse: details.whenToUse,
          tags: details.tags,
          chatCommand: `/${cleanName}`,
          content: String(content),
          sourceUrl,
          license,
          database: savedInNeon ? 'Neon PostgreSQL' : 'Cache Local',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Erro ao processar agente: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deleteAll = searchParams.get('all') === 'true';
    const name = searchParams.get('name');

    const resolved = resolveDatabaseEnv();

    if (deleteAll) {
      if (resolved) {
        await initDb();
        const sql = neon(resolved.connectionString);
        await sql`DELETE FROM agents;`;
      }

      try {
        const dir = ensureAgentsDir();
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
          for (const f of files) {
            fs.unlinkSync(path.join(/*turbopackIgnore: true*/ dir, f));
          }
        }
      } catch {
        // ignore
      }

      return NextResponse.json({
        success: true,
        message: 'Todos os agentes foram excluídos com sucesso',
      });
    }

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    if (resolved) {
      await initDb();
      const sql = neon(resolved.connectionString);
      await sql`DELETE FROM agents WHERE name = ${name};`;
    }

    const fileName = `${name}.md`;
    try {
      const dir = ensureAgentsDir();
      const filePath = path.join(/*turbopackIgnore: true*/ dir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, message: `Agente ${fileName} removido` });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Erro ao remover agente: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
