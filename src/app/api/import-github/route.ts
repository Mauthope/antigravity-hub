import { NextResponse } from 'next/server';
import { LicenseVerifier } from '@/license/verifier';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL do GitHub é obrigatória' }, { status: 400 });
    }

    const cleanUrl = url.trim();

    // Parse owner and repo
    const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) || cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (!match) {
      return NextResponse.json({ error: 'URL do GitHub inválida' }, { status: 400 });
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    // 1. Strict License Verification (0% legal risk: MIT or Apache-2.0)
    const licenseResult = await LicenseVerifier.verifyRepo(owner, repo);
    if (!licenseResult.valid) {
      return NextResponse.json({
        valid: false,
        error: licenseResult.error || 'Repositório não possui licença MIT ou Apache-2.0 autorizada.',
      }, { status: 400 });
    }

    // 2. Fetch markdown content from repo
    const candidates = [
      'SKILL.md',
      'agent.md',
      'AGENTS.md',
      'agents.md',
      'prompt.md',
      'PROMPT.md',
      'README.md',
    ];

    let foundContent = '';
    let foundFileName = 'agent.md';
    const branches = ['main', 'master'];

    for (const b of branches) {
      for (const candidate of candidates) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${candidate}`;
          const res = await fetch(rawUrl, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().length > 30) {
              foundContent = text;
              foundFileName = candidate;
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
        error: `Nenhum arquivo markdown de agente (SKILL.md, agent.md, README.md) encontrado em ${owner}/${repo}`,
      }, { status: 404 });
    }

    // Extract name from markdown or repo
    const titleMatch = foundContent.match(/^#+\s*(.+)$/m);
    const agentName = repo.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const agentTitle = titleMatch ? titleMatch[1].trim() : repo;

    return NextResponse.json({
      valid: true,
      name: agentName,
      title: agentTitle,
      fileName: `${agentName}.md`,
      content: foundContent,
      license: licenseResult.license,
      spdxId: licenseResult.spdxId,
      sourceUrl: cleanUrl,
    });
  } catch (err) {
    return NextResponse.json({
      error: `Erro ao importar do GitHub: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
