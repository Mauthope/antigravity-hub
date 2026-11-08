import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LicenseVerifier } from '@/license/verifier';
import { parseAgentDetails, resolveDatabaseEnv, upsertAgentInDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  try {
    const { url, category: reqCategory } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL do GitHub é obrigatória' }, { status: 400 });
    }

    const cleanUrl = url.trim();

    // Parse owner, repo and optional direct file/subpath
    const blobOrTreeMatch = cleanUrl.match(
      /github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|tree)\/([^\/]+)\/(.+)/i
    );
    const repoMatch =
      cleanUrl.match(/github\.com\/([^\/]+)\/([^\/?#]+)/i) ||
      cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);

    if (!repoMatch && !blobOrTreeMatch) {
      return NextResponse.json({ error: 'URL do GitHub inválida' }, { status: 400 });
    }

    const owner = blobOrTreeMatch ? blobOrTreeMatch[1] : repoMatch![1];
    const repo = (blobOrTreeMatch ? blobOrTreeMatch[2] : repoMatch![2]).replace(/\.git$/, '');
    const explicitBranch = blobOrTreeMatch ? blobOrTreeMatch[3] : undefined;
    const explicitSubpath = blobOrTreeMatch ? blobOrTreeMatch[4].replace(/\/$/, '') : '';

    // 1. Strict License Verification (0% legal risk: MIT or Apache-2.0)
    const licenseResult = await LicenseVerifier.verifyRepo(
      owner,
      repo,
      explicitBranch || 'main'
    );
    if (!licenseResult.valid) {
      return NextResponse.json(
        {
          valid: false,
          error:
            licenseResult.error ||
            'Repositório não possui licença MIT ou Apache-2.0 autorizada.',
        },
        { status: 400 }
      );
    }

    // 2. Fetch markdown content from repo (supports direct .md links, subfolder trees, or root)
    const candidates = [
      'SKILL.md',
      'agent.md',
      'AGENTS.md',
      'agents.md',
      'prompt.md',
      'PROMPT.md',
      'README.md',
    ];

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const baseHeaders: Record<string, string> = {
      'User-Agent': 'Antigravity-Hub/1.0',
    };
    if (token && token.trim().length > 0) {
      baseHeaders['Authorization'] = `Bearer ${token.trim()}`;
    }

    let foundContent = '';
    const branches = Array.from(
      new Set(explicitBranch ? [explicitBranch, 'HEAD', 'main', 'master'] : ['HEAD', 'main', 'master'])
    ).filter(Boolean);

    for (const b of branches) {
      if (explicitSubpath && explicitSubpath.toLowerCase().endsWith('.md')) {
        const directUrls = [
          `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${explicitSubpath}`,
          `https://github.com/${owner}/${repo}/raw/${b}/${explicitSubpath}`,
        ];
        for (const rawUrl of directUrls) {
          try {
            const res = await fetch(rawUrl, {
              headers: baseHeaders,
              signal: AbortSignal.timeout(6000),
            });
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim().length > 20) {
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

      for (const candidate of candidates) {
        const targetPath = explicitSubpath
          ? `${explicitSubpath}/${candidate}`
          : candidate;
        const candidateUrls = [
          `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${targetPath}`,
          `https://github.com/${owner}/${repo}/raw/${b}/${targetPath}`,
        ];

        for (const rawUrl of candidateUrls) {
          try {
            const res = await fetch(rawUrl, {
              headers: baseHeaders,
              signal: AbortSignal.timeout(6000),
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
      if (foundContent) break;
    }

    if (!foundContent) {
      return NextResponse.json(
        {
          error: `Nenhum arquivo markdown de agente (SKILL.md, agent.md, README.md) encontrado em ${owner}/${repo}`,
        },
        { status: 404 }
      );
    }

    const baseSlug = explicitSubpath
      ? path.basename(explicitSubpath, '.md')
      : repo;
    const agentName =
      baseSlug
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/^-|-$/g, '') || 'github-agent';
    const fileName = `${agentName}.md`;
    const details = parseAgentDetails(foundContent, agentName, reqCategory);
    const category = reqCategory || details.category;
    const canonicalLicense = licenseResult.spdxId || licenseResult.license || 'MIT';

    // 3. Atomic Persistence into Neon PostgreSQL right inside /api/import-github!
    const resolved = resolveDatabaseEnv();
    let savedInNeon = false;
    let dbRowId: number | undefined;

    if (resolved) {
      try {
        const { row } = await upsertAgentInDb({
          name: agentName,
          title: details.title,
          content: foundContent,
          fileName,
          category,
          sourceUrl: cleanUrl,
          license: canonicalLicense,
        });
        savedInNeon = true;
        dbRowId = row.id;
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error('[POST /api/import-github] Falha ao salvar no Neon:', msg);
        return NextResponse.json(
          {
            valid: false,
            error: `Licença ${canonicalLicense} aprovada, porém falhou ao gravar na tabela 'agents' do Neon (${resolved.envVarName}): ${msg}`,
          },
          { status: 500 }
        );
      }
    }

    try {
      const dir = getAgentsDir();
      fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, fileName), foundContent, 'utf-8');
    } catch {
      // ignore
    }

    return NextResponse.json({
      valid: true,
      savedInNeon,
      name: agentName,
      title: details.title,
      fileName,
      category,
      content: foundContent,
      license: canonicalLicense,
      spdxId: licenseResult.spdxId,
      sourceUrl: cleanUrl,
      warning: !savedInNeon
        ? 'Licença aprovada, mas DATABASE_URL não está configurada na Vercel — salvo apenas localmente no navegador.'
        : undefined,
      agent: {
        id: dbRowId,
        name: agentName,
        fileName,
        title: details.title,
        category,
        whatItDoes: details.whatItDoes,
        whenToUse: details.whenToUse,
        tags: [...details.tags, canonicalLicense],
        chatCommand: `/${agentName}`,
        content: foundContent,
        sourceUrl: cleanUrl,
        license: canonicalLicense,
        database: savedInNeon ? 'Neon PostgreSQL' : 'Cache Local',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Erro ao importar do GitHub: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
