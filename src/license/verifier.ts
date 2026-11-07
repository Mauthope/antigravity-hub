import { LicenseVerificationResult, ALLOWED_LICENSES } from '../types/index.js';

export class LicenseVerifier {
  /**
   * Strictly verify that the target GitHub repository has an approved license (MIT or Apache-2.0).
   * Ensures 0% legal risk.
   */
  static async verifyRepo(owner: string, repo: string, branch = 'main'): Promise<LicenseVerificationResult> {
    try {
      // 1. Check via GitHub API
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/license`;
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Antigravity-Hub-LicenseVerifier/1.0',
        },
      });

      if (response.ok) {
        const data = await response.json() as {
          license?: {
            key?: string;
            spdx_id?: string;
            name?: string;
          };
        };

        const spdxId = data.license?.spdx_id?.trim();
        const key = data.license?.key?.trim().toLowerCase();

        const clean = (spdxId || key || '').toLowerCase();
        if (clean === 'mit' || clean === 'apache-2.0') {
          const canonical = clean === 'apache-2.0' ? 'Apache-2.0' : 'MIT';
          return {
            valid: true,
            license: data.license?.name || (canonical === 'MIT' ? 'MIT License' : 'Apache License 2.0'),
            spdxId: canonical,
            source: 'api',
          };
        }

        // Detected a non-allowed license (e.g. GPL, AGPL, BSD, etc.)
        return {
          valid: false,
          license: data.license?.name || 'Não permitida',
          spdxId: spdxId || key,
          source: 'api',
          error: `🚫 BLOQUEIO DE CONFORMIDADE JURÍDICA: A licença do repositório '${owner}/${repo}' é '${data.license?.name || spdxId || key}'. Política estrita: apenas licenças [MIT] e [Apache-2.0] são autorizadas para garantir 0% de risco legal. Instalação abortada.`,
        };
      }

      // 2. If API returned 404 or failed, try inspecting raw LICENSE files
      const rawLicense = await this.fetchRawLicenseText(owner, repo, branch);
      if (rawLicense) {
        return this.verifyText(rawLicense, `Repositório ${owner}/${repo} (LICENSE)`);
      }

      return {
        valid: false,
        source: 'none',
        error: `🚫 BLOQUEIO DE CONFORMIDADE JURÍDICA: Nenhuma licença explícita foi encontrada no repositório '${owner}/${repo}'. Pela legislação de direitos autorais ('Todos os direitos reservados'), a importação é terminantemente proibida sem licença explícita MIT ou Apache-2.0.`,
      };
    } catch (err) {
      return {
        valid: false,
        source: 'none',
        error: `Erro ao auditar licença do repositório '${owner}/${repo}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Verify raw text (from LICENSE file or SKILL.md content) for valid MIT or Apache-2.0 declaration.
   */
  static verifyText(content: string, contextDescription = 'arquivo'): LicenseVerificationResult {
    // 1. Check for SPDX identifier
    const spdxMatch = content.match(/SPDX-License-Identifier:\s*([A-Za-z0-9_.-]+)/i);
    if (spdxMatch && spdxMatch[1]) {
      const spdx = spdxMatch[1].trim();
      if (this.isAllowedSpdx(spdx)) {
        return {
          valid: true,
          license: spdx,
          spdxId: spdx,
          source: 'spdx_header',
        };
      }
      return {
        valid: false,
        license: spdx,
        spdxId: spdx,
        source: 'spdx_header',
        error: `🚫 BLOQUEIO JURÍDICO: Cabeçalho SPDX identificou licença '${spdx}' em ${contextDescription}. Apenas MIT e Apache-2.0 são permitidas.`,
      };
    }

    // 2. Check for MIT patterns
    const isMit =
      /MIT\s+License/i.test(content) ||
      (/Permission\s+is\s+hereby\s+granted,\s+free\s+of\s+charge/i.test(content) &&
        /to\s+deal\s+in\s+the\s+Software\s+without\s+restriction/i.test(content));

    if (isMit) {
      return {
        valid: true,
        license: 'MIT License',
        spdxId: 'MIT',
        source: 'license_file',
      };
    }

    // 3. Check for Apache-2.0 patterns
    const isApache =
      (/Apache\s+License/i.test(content) && /Version\s+2\.0/i.test(content)) ||
      /http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/i.test(content) ||
      /https:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/i.test(content);

    if (isApache) {
      return {
        valid: true,
        license: 'Apache License 2.0',
        spdxId: 'Apache-2.0',
        source: 'license_file',
      };
    }

    // 4. Check for copyleft indicators to give accurate warning
    if (/GNU\s+(General|Affero|Lesser)\s+Public\s+License/i.test(content) || /GPL/i.test(content)) {
      return {
        valid: false,
        license: 'GPL / Copyleft',
        source: 'license_file',
        error: `🚫 BLOQUEIO JURÍDICO: Detectada licença Copyleft/GPL em ${contextDescription}. Licenças GPL exigem reciprocidade e representam risco de contaminação viral de código. Instalação estritamente bloqueada.`,
      };
    }

    return {
      valid: false,
      source: 'none',
      error: `🚫 BLOQUEIO JURÍDICO: O conteúdo de ${contextDescription} não possui termos reconhecidos das licenças MIT ou Apache-2.0. Risco legal não nulo.`,
    };
  }

  private static isAllowedSpdx(spdx: string): boolean {
    const clean = spdx.trim().toLowerCase();
    return clean === 'mit' || clean === 'apache-2.0';
  }

  private static async fetchRawLicenseText(owner: string, repo: string, branch: string): Promise<string | null> {
    const candidateFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'COPYING'];
    const candidateBranches = [branch, 'main', 'master'];

    for (const b of candidateBranches) {
      for (const file of candidateFiles) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${file}`;
          const res = await fetch(rawUrl, {
            headers: { 'User-Agent': 'Antigravity-Hub-LicenseVerifier/1.0' },
          });
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().length > 20) {
              return text;
            }
          }
        } catch {
          // ignore and try next candidate
        }
      }
    }
    return null;
  }
}
