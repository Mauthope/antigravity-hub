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

export function parseAgentDetails(content: string, name: string) {
  // Extract title
  const titleMatch = content.match(/^#+\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\(`.*`\)/, '').trim() : name;

  // Extract 'O Que Este Agente Faz'
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

  // Extract 'Quando Usar'
  const whenMatch = content.match(/##\s*Quando Usar\s*([\s\S]*?)(?=\n##|$)/i);
  const whenToUse = whenMatch
    ? whenMatch[1].trim()
    : 'Invoque no chat quando precisar de auxílio especializado nesta área.';

  // Specialized tags
  let tags = ['Agente Markdown'];
  const lower = name.toLowerCase();
  if (lower.includes('designer') || lower.includes('akiom')) {
    tags = ['UI/UX', 'Design System', 'Responsividade', 'Zero Emojis'];
  } else if (lower.includes('reviewer') || lower.includes('code')) {
    tags = ['Clean Code', 'Segurança', 'OWASP', 'Qualidade'];
  } else if (lower.includes('architect') || lower.includes('cloud')) {
    tags = ['PostgreSQL', 'Neon', 'Microsserviços', 'Arquitetura'];
  } else if (lower.includes('hub')) {
    tags = ['Orquestrador', 'GitHub', 'Skills'];
  }

  return { title, whatItDoes, whenToUse, tags };
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

      if (rows && rows.length > 0) {
        const agents = rows.map((r) => {
          const details = parseAgentDetails(r.content, r.name);
          return {
            name: r.name,
            fileName: r.file_name,
            title: r.title || details.title,
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

        return NextResponse.json({ agents, databaseConnected: true });
      }
    } catch (dbErr) {
      console.warn('Aviso: Erro ao consultar Neon DB, usando arquivos locais:', dbErr);
    }
  }

  // 2. Fallback to local files in agents/
  try {
    const dir = ensureAgentsDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ agents: [], databaseConnected: !!sql });
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const agents = files.map((fileName) => {
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
          tags: details.tags,
          content,
          chatCommand: `/${name}`,
          database: 'Local File',
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ agents, databaseConnected: !!sql });
  } catch {
    return NextResponse.json({ agents: [], databaseConnected: !!sql });
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
    const details = parseAgentDetails(content, cleanName);

    const sql = getDb();
    let savedInNeon = false;

    // 1. Save to Neon PostgreSQL
    if (sql) {
      try {
        await initDb();
        await sql`
          INSERT INTO agents (name, title, content, file_name, source_url, license, updated_at)
          VALUES (${cleanName}, ${details.title}, ${content}, ${fileName}, ${sourceUrl || null}, ${license || null}, CURRENT_TIMESTAMP)
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
        title: details.title,
        whatItDoes: details.whatItDoes,
        whenToUse: details.whenToUse,
        tags: details.tags,
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
