import path from 'node:path';
import fs from 'node:fs';
import yaml from 'yaml';
import { LicenseVerifier } from '../license/verifier.js';
import {
  SkillDefinition,
  SkillFrontmatter,
  SkillFrontmatterSchema,
  HubPaths,
} from '../types/index.js';
import { resolveHubPaths, ensureDir } from '../utils/paths.js';

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  subpath: string;
  isRaw: boolean;
  isGist: boolean;
  gistId?: string;
  originalUrl: string;
}

export class GitHubSkillImporter {
  /**
   * Parse various formats of GitHub URLs.
   */
  static parseUrl(rawUrl: string): ParsedGitHubUrl {
    const cleanUrl = rawUrl.trim();

    // Gist URL
    const gistMatch = cleanUrl.match(/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/i);
    if (gistMatch) {
      return {
        owner: gistMatch[1],
        repo: gistMatch[2],
        branch: 'main',
        subpath: '',
        isRaw: false,
        isGist: true,
        gistId: gistMatch[2],
        originalUrl: cleanUrl,
      };
    }

    // Raw GitHub URL
    const rawMatch = cleanUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/i);
    if (rawMatch) {
      return {
        owner: rawMatch[1],
        repo: rawMatch[2],
        branch: rawMatch[3],
        subpath: rawMatch[4],
        isRaw: true,
        isGist: false,
        originalUrl: cleanUrl,
      };
    }

    // Standard GitHub repo or tree/blob URL
    const ghMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+)(?:\/(.*))?)?/i);
    if (ghMatch) {
      const owner = ghMatch[1];
      const repo = ghMatch[2].replace(/\.git$/, '');
      const branch = ghMatch[4] || 'main';
      const subpath = ghMatch[5] || '';
      return {
        owner,
        repo,
        branch,
        subpath,
        isRaw: false,
        isGist: false,
        originalUrl: cleanUrl,
      };
    }

    // Shorthand owner/repo format: "owner/repo" or "owner/repo/path"
    const shorthandMatch = cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/(.*))?$/);
    if (shorthandMatch) {
      return {
        owner: shorthandMatch[1],
        repo: shorthandMatch[2],
        branch: 'main',
        subpath: shorthandMatch[3] || '',
        isRaw: false,
        isGist: false,
        originalUrl: cleanUrl,
      };
    }

    throw new Error(`URL do GitHub inválida ou não reconhecida: '${cleanUrl}'`);
  }

  /**
   * Import a skill from GitHub with strict MIT/Apache-2.0 license check.
   */
  static async importSkill(
    urlOrShorthand: string,
    options: {
      target?: 'local' | 'global' | 'both';
      workspaceRoot?: string;
      customName?: string;
    } = {}
  ): Promise<SkillDefinition> {
    const parsed = this.parseUrl(urlOrShorthand);
    const target = options.target || 'local';

    console.log(`\n[INFO] [1/4] Auditando licença de '${parsed.owner}/${parsed.repo}'...`);

    // STEP 1: STRICT LICENSE AUDIT (0% LEGAL RISK)
    const licenseResult = await LicenseVerifier.verifyRepo(parsed.owner, parsed.repo, parsed.branch);
    if (!licenseResult.valid) {
      console.error(`\n[BLOQUEIO] ERRO DE CONFORMIDADE LEGAL:`);
      console.error(licenseResult.error);
      throw new Error(licenseResult.error);
    }

    console.log(`[OK] [1/4] Licença aprovada: ${licenseResult.license} (${licenseResult.spdxId}) - Conformidade 100% garantida.`);

    // STEP 2: FETCH SKILL CONTENT
    console.log(`[INFO] [2/4] Baixando conteúdo da skill...`);
    const { rawContent, files } = await this.fetchSkillContent(parsed);

    // STEP 3: PARSE AND NORMALIZE FRONTMATTER
    console.log(`[INFO] [3/4] Validando formato e metadados...`);
    const skillDef = this.parseAndNormalizeSkill(rawContent, parsed, licenseResult.spdxId, options.customName);
    skillDef.files = files;
    skillDef.sourceUrl = parsed.originalUrl;
    skillDef.licenseResult = licenseResult;

    // STEP 4: INSTALLATION TO DESTINATION
    console.log(`[INFO] [4/4] Instalando skill '${skillDef.frontmatter.name}' (${target})...`);
    const paths = resolveHubPaths(options.workspaceRoot);
    await this.installToDisk(skillDef, paths, target);

    console.log(`[SUCESSO] Skill '${skillDef.frontmatter.name}' instalada com sucesso.`);
    return skillDef;
  }

  /**
   * Fetch the main SKILL.md file and any supporting files.
   */
  private static async fetchSkillContent(
    parsed: ParsedGitHubUrl
  ): Promise<{ rawContent: string; files: Record<string, string> }> {
    const files: Record<string, string> = {};

    if (parsed.isGist && parsed.gistId) {
      const gistApi = `https://api.github.com/gists/${parsed.gistId}`;
      const res = await fetch(gistApi, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
      if (!res.ok) throw new Error(`Falha ao acessar Gist: HTTP ${res.status}`);
      const data = await res.json() as { files: Record<string, { filename: string; content: string }> };

      // Look for SKILL.md or the first markdown file
      let mainContent = '';
      for (const [filename, fileObj] of Object.entries(data.files)) {
        if (filename.toLowerCase() === 'skill.md' || filename.toLowerCase().endsWith('.md')) {
          mainContent = fileObj.content;
        } else {
          files[filename] = fileObj.content;
        }
      }
      if (!mainContent) throw new Error(`Nenhum arquivo markdown ou SKILL.md encontrado no Gist.`);
      return { rawContent: mainContent, files };
    }

    // If direct raw file or pointing to SKILL.md
    if (parsed.isRaw || parsed.subpath.toLowerCase().endsWith('.md')) {
      const rawUrl = parsed.isRaw
        ? parsed.originalUrl
        : `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.subpath}`;
      const res = await fetch(rawUrl, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
      if (!res.ok) throw new Error(`Falha ao baixar arquivo de ${rawUrl}: HTTP ${res.status}`);
      const rawContent = await res.text();
      return { rawContent, files };
    }

    // Search candidate paths in the repository or subpath
    const candidates = [
      parsed.subpath ? `${parsed.subpath}/SKILL.md` : 'SKILL.md',
      parsed.subpath ? `${parsed.subpath}/README.md` : 'README.md',
      'skills/SKILL.md',
    ];

    let foundContent: string | null = null;
    let successfulBranch = parsed.branch;

    const branchesToTry = [parsed.branch, 'main', 'master'];
    for (const b of branchesToTry) {
      for (const candidate of candidates) {
        try {
          const testUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${b}/${candidate}`;
          const res = await fetch(testUrl, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
          if (res.ok) {
            foundContent = await res.text();
            successfulBranch = b;
            break;
          }
        } catch {
          // continue
        }
      }
      if (foundContent) break;
    }

    if (!foundContent) {
      throw new Error(
        `Não foi possível localizar o arquivo SKILL.md no repositório '${parsed.owner}/${parsed.repo}'. Verifique se o caminho especificado contém um arquivo SKILL.md.`
      );
    }

    // Try fetching auxiliary scripts if referenced
    await this.fetchAuxiliaryFiles(parsed, successfulBranch, foundContent, files);

    return { rawContent: foundContent, files };
  }

  private static async fetchAuxiliaryFiles(
    parsed: ParsedGitHubUrl,
    branch: string,
    content: string,
    outFiles: Record<string, string>
  ): Promise<void> {
    // Scan for script paths like scripts/something.sh or references/doc.md
    const scriptMatches = content.match(/(?:scripts|references|assets)\/[a-zA-Z0-9_.-]+/g) || [];
    const uniqueFiles = Array.from(new Set(scriptMatches));

    for (const relPath of uniqueFiles) {
      try {
        const fullRel = parsed.subpath ? `${parsed.subpath}/${relPath}` : relPath;
        const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${fullRel}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Antigravity-Hub/1.0' } });
        if (res.ok) {
          outFiles[relPath] = await res.text();
        }
      } catch {
        // ignore missing auxiliary files
      }
    }
  }

  /**
   * Parse frontmatter, validate or auto-generate missing fields.
   */
  private static parseAndNormalizeSkill(
    rawContent: string,
    parsed: ParsedGitHubUrl,
    licenseId = 'MIT',
    customName?: string
  ): SkillDefinition {
    let frontmatter: SkillFrontmatter;
    let instructions = rawContent;

    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = rawContent.match(fmRegex);

    if (match) {
      try {
        const parsedFm = yaml.parse(match[1]) as Record<string, unknown>;
        const nameCandidate = customName || (typeof parsedFm.name === 'string' ? parsedFm.name : null) || this.sanitizeName(parsed.repo);
        const descriptionCandidate =
          (typeof parsedFm.description === 'string' ? parsedFm.description : null) ||
          `Habilidade importada de ${parsed.owner}/${parsed.repo}`;

        frontmatter = SkillFrontmatterSchema.parse({
          ...parsedFm,
          name: this.sanitizeName(nameCandidate),
          description: descriptionCandidate,
          license: licenseId,
          repository: `https://github.com/${parsed.owner}/${parsed.repo}`,
        });
        instructions = match[2].trim();
      } catch (err) {
        console.warn(`Aviso: Frontmatter YAML inválido, gerando frontmatter automático...`);
        frontmatter = this.generateFallbackFrontmatter(parsed, rawContent, licenseId, customName);
      }
    } else {
      frontmatter = this.generateFallbackFrontmatter(parsed, rawContent, licenseId, customName);
    }

    // Reconstruct normalized full content with validated frontmatter
    const normalizedRaw = `---\n${yaml.stringify(frontmatter).trim()}\n---\n\n${instructions}\n`;

    return {
      frontmatter,
      instructions,
      rawContent: normalizedRaw,
    };
  }

  private static generateFallbackFrontmatter(
    parsed: ParsedGitHubUrl,
    content: string,
    licenseId: string,
    customName?: string
  ): SkillFrontmatter {
    const inferredName = customName || this.sanitizeName(parsed.subpath.split('/').pop() || parsed.repo);
    const titleMatch = content.match(/^#+\s*(.+)$/m);
    const inferredDescription = titleMatch ? titleMatch[1].trim() : `Habilidade importada de ${parsed.owner}/${parsed.repo}`;

    return {
      name: inferredName,
      description: inferredDescription,
      license: licenseId,
      repository: `https://github.com/${parsed.owner}/${parsed.repo}`,
      version: '1.0.0',
      tags: ['imported', 'github'],
    };
  }

  private static sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'custom-skill';
  }

  /**
   * Save the skill and auxiliary files to disk.
   */
  private static async installToDisk(
    skillDef: SkillDefinition,
    paths: HubPaths,
    target: 'local' | 'global' | 'both'
  ): Promise<void> {
    const installLocations: string[] = [];

    if (target === 'local' || target === 'both') {
      installLocations.push(path.join(paths.localSkillsDir, skillDef.frontmatter.name));
    }
    if (target === 'global' || target === 'both') {
      installLocations.push(path.join(paths.globalSkillsDir, skillDef.frontmatter.name));
    }

    for (const skillDir of installLocations) {
      ensureDir(skillDir);

      // Write SKILL.md
      const mainPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(mainPath, skillDef.rawContent, 'utf-8');

      // Write auxiliary files (scripts, references)
      if (skillDef.files) {
        for (const [relPath, content] of Object.entries(skillDef.files)) {
          const filePath = path.join(skillDir, relPath);
          ensureDir(path.dirname(filePath));
          fs.writeFileSync(filePath, content, 'utf-8');
          // Make scripts executable if .sh
          if (relPath.endsWith('.sh') || relPath.endsWith('.bash')) {
            try {
              fs.chmodSync(filePath, 0o755);
            } catch {
              // ignore on some filesystems
            }
          }
        }
      }
    }
  }
}
