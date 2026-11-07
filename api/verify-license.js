// Vercel Serverless Function: License Verifier (0% Legal Risk: MIT & Apache-2.0 only)
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const queryUrl = req.query.url || req.body?.url;
  if (!queryUrl) {
    return res.status(400).json({ error: 'URL do GitHub é obrigatória (?url=...)' });
  }

  try {
    // Parse owner and repo
    const match = queryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i) || queryUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (!match) {
      return res.status(400).json({ valid: false, error: 'Formato de URL do GitHub inválido' });
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/license`;
    const ghRes = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Antigravity-Hub-Vercel/1.0',
      },
    });

    if (!ghRes.ok) {
      return res.status(200).json({
        valid: false,
        error: `🚫 BLOQUEIO DE CONFORMIDADE JURÍDICA: Nenhuma licença explícita foi detectada no repositório '${owner}/${repo}'. Pela legislação de direitos autorais ('Todos os direitos reservados'), a importação é terminantemente proibida sem licença explícita MIT ou Apache-2.0.`,
      });
    }

    const data = await ghRes.json();
    const spdxId = (data.license?.spdx_id || '').trim().toLowerCase();
    const key = (data.license?.key || '').trim().toLowerCase();

    if (spdxId === 'mit' || key === 'mit') {
      return res.status(200).json({
        valid: true,
        license: 'MIT License',
        spdxId: 'MIT',
        repo: `${owner}/${repo}`,
      });
    }

    if (spdxId === 'apache-2.0' || key === 'apache-2.0') {
      return res.status(200).json({
        valid: true,
        license: 'Apache License 2.0',
        spdxId: 'Apache-2.0',
        repo: `${owner}/${repo}`,
      });
    }

    return res.status(200).json({
      valid: false,
      license: data.license?.name || spdxId,
      error: `🚫 BLOQUEIO DE CONFORMIDADE JURÍDICA: A licença do repositório '${owner}/${repo}' é '${data.license?.name || spdxId}'. Política estrita: apenas licenças [MIT] e [Apache-2.0] são autorizadas para garantir 0% de risco legal. Instalação abortada.`,
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      error: `Erro ao auditar licença: ${err.message}`,
    });
  }
}
