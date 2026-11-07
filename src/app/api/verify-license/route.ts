import { NextResponse } from 'next/server';
import { LicenseVerifier } from '@/license/verifier';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL do GitHub é obrigatória (?url=...)' }, { status: 400 });
  }

  const match = targetUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) || targetUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (!match) {
    return NextResponse.json({ valid: false, error: 'Formato de URL do GitHub inválido' }, { status: 400 });
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  const result = await LicenseVerifier.verifyRepo(owner, repo);
  return NextResponse.json(result);
}
