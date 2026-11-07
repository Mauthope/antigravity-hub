import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function getAgentsDir(): string {
  // On Vercel / AWS Lambda, process.cwd() (/var/task) is read-only!
  // Only /tmp is writable.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'agents');
  }

  // Try local cwd, fallback to tmpdir if not writable
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
  try {
    const dir = ensureAgentsDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ agents: [] });
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
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ agents: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, content } = body;

    if (!name || !content) {
      return NextResponse.json({ error: 'Nome e conteúdo (.md) são obrigatórios' }, { status: 400 });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '') || 'custom-agent';
    const fileName = `${cleanName}.md`;

    // Try saving to writable dir (/tmp/agents on Vercel)
    try {
      const dir = ensureAgentsDir();
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (fsErr) {
      console.warn('Aviso: Sistema de arquivos read-only no Vercel, respondendo sucesso para armazenamento no cliente:', fsErr);
    }

    const titleMatch = content.match(/^#+\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : cleanName;

    return NextResponse.json({
      success: true,
      agent: {
        name: cleanName,
        fileName,
        title,
        chatCommand: `/${cleanName}`,
        content,
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
