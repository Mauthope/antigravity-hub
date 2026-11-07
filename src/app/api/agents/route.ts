import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb, initDb } from '@/lib/db';

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

export async function GET() {
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

      const agents = rows.map((r) => ({
        name: r.name,
        fileName: r.file_name,
        title: r.title,
        content: r.content,
        chatCommand: `/${r.name}`,
        sourceUrl: r.source_url,
        license: r.license,
        database: 'Neon PostgreSQL',
      }));

      return NextResponse.json({ agents, databaseConnected: true });
    } catch (dbErr) {
      console.warn('Erro ao consultar Neon DB, usando fallback local:', dbErr);
    }
  }

  // 2. Fallback to local files
  try {
    const dir = ensureAgentsDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ agents: [], databaseConnected: false });
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const agents = files.map((fileName) => {
      try {
        const filePath = path.join(dir, fileName);
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = fileName.replace(/\.md$/, '');
        const titleMatch = content.match(/^#+\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : name;

        return {
          name,
          fileName,
          title,
          content,
          chatCommand: `/${name}`,
          database: 'Local File',
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ agents, databaseConnected: false });
  } catch {
    return NextResponse.json({ agents: [], databaseConnected: false });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, content, sourceUrl, license } = body;

    if (!name || !content) {
      return NextResponse.json({ error: 'Nome e conteúdo (.md) são obrigatórios' }, { status: 400 });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '') || 'custom-agent';
    const fileName = `${cleanName}.md`;
    const titleMatch = content.match(/^#+\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : cleanName;

    const sql = getDb();
    let savedInNeon = false;

    // 1. Save to Neon PostgreSQL
    if (sql) {
      try {
        await initDb();
        await sql`
          INSERT INTO agents (name, title, content, file_name, source_url, license, updated_at)
          VALUES (${cleanName}, ${title}, ${content}, ${fileName}, ${sourceUrl || null}, ${license || null}, CURRENT_TIMESTAMP)
          ON CONFLICT (name) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            file_name = EXCLUDED.file_name,
            source_url = EXCLUDED.source_url,
            license = EXCLUDED.license,
            updated_at = CURRENT_TIMESTAMP;
        `;
        savedInNeon = true;
      } catch (dbErr) {
        console.warn('Erro ao salvar no Neon PostgreSQL:', dbErr);
      }
    }

    // 2. Also try writing to local fallback
    try {
      const dir = ensureAgentsDir();
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      savedIn: savedInNeon ? 'Neon PostgreSQL' : 'Local / Cache',
      agent: {
        name: cleanName,
        fileName,
        title,
        chatCommand: `/${cleanName}`,
        content,
        sourceUrl,
        license,
      },
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao processar agente: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const sql = getDb();
    if (sql) {
      try {
        await initDb();
        await sql`DELETE FROM agents WHERE name = ${name};`;
      } catch (err) {
        console.warn('Erro ao deletar do Neon:', err);
      }
    }

    const fileName = `${name}.md`;
    try {
      const dir = ensureAgentsDir();
      const filePath = path.join(dir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, message: `Agente ${fileName} removido` });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 });
  }
}
