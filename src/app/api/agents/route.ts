import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

const AGENTS_DIR = path.join(process.cwd(), 'agents');

function ensureAgentsDir() {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

export async function GET() {
  ensureAgentsDir();

  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  const agents = files.map((fileName) => {
    const filePath = path.join(AGENTS_DIR, fileName);
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
  });

  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  try {
    ensureAgentsDir();
    const body = await request.json();
    const { name, content } = body;

    if (!name || !content) {
      return NextResponse.json({ error: 'Nome e conteúdo (.md) são obrigatórios' }, { status: 400 });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '');
    const fileName = `${cleanName}.md`;
    const filePath = path.join(AGENTS_DIR, fileName);

    fs.writeFileSync(filePath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      agent: {
        name: cleanName,
        fileName,
        chatCommand: `/${cleanName}`,
        content,
      },
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao salvar agente: ${err instanceof Error ? err.message : String(err)}` },
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
    const filePath = path.join(AGENTS_DIR, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: `Agente ${fileName} removido` });
    }

    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 });
  }
}
