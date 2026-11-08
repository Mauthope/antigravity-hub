import { neon } from '@neondatabase/serverless';

export interface DbAgent {
  id?: number;
  name: string;
  title: string;
  content: string;
  file_name: string;
  category?: string | null;
  source_url?: string | null;
  license?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ResolvedDbEnv {
  connectionString: string;
  envVarName: string;
  host: string;
  databaseName: string;
}

export interface DbStatusResult {
  connected: boolean;
  configured: boolean;
  envVarName?: string;
  host?: string;
  databaseName?: string;
  tableExists?: boolean;
  agentCount?: number;
  timestamp?: string;
  message: string;
  error?: string;
}

const PRIORITY_ENV_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
  'AGENTS_MPG_DATABASE_URL',
  'AGENTS_MPG_POSTGRES_URL',
  'AGENTS_MPG_DATABASE_URL_UNPOOLED',
  'AGENTS_MPG_POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL',
  'STORAGE_DATABASE_URL',
  'STORAGE_POSTGRES_URL',
];

/**
 * Sanitiza strings de conexão copiadas do console Neon (ex: remove prefixo `psql `,
 * aspas envolventes, quebras de linha ou espaços extras).
 */
export function sanitizeConnectionString(raw: string): string {
  let clean = raw.replace(/[\r\n]+/g, ' ').trim();

  if (/^psql\s+/i.test(clean)) {
    clean = clean.replace(/^psql\s+/i, '').trim();
  }

  // Remove aspas simples, duplas ou crases ao redor
  clean = clean.replace(/^['"`]+|['"`]+$/g, '').trim();

  // Caso ainda haja flags do psql (ex: -d 'postgresql://...'), extrai a URL postgres
  const urlMatch = clean.match(/(postgres(?:ql)?:\/\/[^\s'"`]+)/i);
  if (urlMatch) {
    clean = urlMatch[1];
  }

  return clean;
}

/**
 * Extrai host e nome do banco sem expor usuário ou senha.
 */
export function extractConnectionMeta(connectionString: string): {
  host: string;
  databaseName: string;
  validFormat: boolean;
} {
  try {
    const protocolMatch = connectionString.match(/^(postgres(?:ql)?):\/\//i);
    if (!protocolMatch) {
      return { host: 'formato-invalido', databaseName: 'desconhecido', validFormat: false };
    }
    const httpEquivalent = 'http://' + connectionString.slice(protocolMatch[0].length);
    const parsed = new URL(httpEquivalent);
    const host = parsed.hostname || 'desconhecido';
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'desconhecido';
    const validFormat = Boolean(parsed.username && host !== 'desconhecido' && databaseName !== 'desconhecido');
    return { host, databaseName, validFormat };
  } catch {
    return { host: 'formato-invalido', databaseName: 'desconhecido', validFormat: false };
  }
}

/**
 * Descobre automaticamente a variável de ambiente do Neon/Postgres (incluindo prefixos
 * criados pela integração Storage da Vercel, como AGENTS_MPG_DATABASE_URL).
 */
export function resolveDatabaseEnv(
  envObj: Record<string, string | undefined> = process.env
): ResolvedDbEnv | null {
  for (const key of PRIORITY_ENV_KEYS) {
    const raw = envObj[key];
    if (raw && raw.trim().length > 0) {
      const connectionString = sanitizeConnectionString(raw);
      const meta = extractConnectionMeta(connectionString);
      return {
        connectionString,
        envVarName: key,
        host: meta.host,
        databaseName: meta.databaseName,
      };
    }
  }

  // Busca dinâmica por qualquer variável customizada *_DATABASE_URL ou *_POSTGRES_URL
  for (const [key, raw] of Object.entries(envObj)) {
    if (!raw || raw.trim().length === 0) continue;
    if (/(DATABASE_URL|POSTGRES_URL|NEON_.*URL)$/i.test(key)) {
      const connectionString = sanitizeConnectionString(raw);
      const meta = extractConnectionMeta(connectionString);
      return {
        connectionString,
        envVarName: key,
        host: meta.host,
        databaseName: meta.databaseName,
      };
    }
  }

  return null;
}

let lastInitializedHostDb: string | null = null;

export function getDb() {
  const resolved = resolveDatabaseEnv();
  if (!resolved) {
    return null;
  }
  return neon(resolved.connectionString);
}

/**
 * Lê agentes oficiais incluídos no repositório (`agents/*.md`, como `start.md` e `designer-akiom.md`).
 */
export function loadBundledAgentsFromRepo(): Array<{
  name: string;
  title: string;
  content: string;
  fileName: string;
  category: string;
  license: string;
}> {
  try {
    if (typeof process === 'undefined' || typeof (process as any).getBuiltinModule !== 'function') {
      return [];
    }
    const fs = (process as any).getBuiltinModule('node:fs') as typeof import('node:fs');
    const path = (process as any).getBuiltinModule('node:path') as typeof import('node:path');
    if (!fs || !path) return [];

    const repoAgentsDir = path.join(process.cwd(), 'agents');
    if (!fs.existsSync(repoAgentsDir)) {
      return [];
    }

    const files = fs
      .readdirSync(repoAgentsDir)
      .filter((f: string) => f.endsWith('.md'));

    const bundled: Array<{
      name: string;
      title: string;
      content: string;
      fileName: string;
      category: string;
      license: string;
    }> = [];

    for (const fileName of files) {
      try {
        const fullPath = path.join(repoAgentsDir, fileName);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const name = fileName.replace(/\.md$/, '');
        const details = parseAgentDetails(content, name);
        const licenseMatch = content.match(/^license:\s*(.+)$/im);
        const license = licenseMatch ? licenseMatch[1].trim() : 'MIT';

        bundled.push({
          name,
          title: details.title,
          content,
          fileName,
          category: details.category,
          license,
        });
      } catch {
        // ignore invalid file
      }
    }

    return bundled;
  } catch {
    return [];
  }
}

/**
 * Cria a tabela `agents` se não existir e garante o registro automático dos
 * agentes base do repositório (`start`, `designer-akiom`, etc.).
 * Propaga erros reais caso a conexão ou permissão falhe.
 */
export async function initDb(): Promise<ResolvedDbEnv | null> {
  const resolved = resolveDatabaseEnv();
  if (!resolved) return null;

  const cacheKey = `${resolved.host}/${resolved.databaseName}`;
  const sql = neon(resolved.connectionString);

  if (lastInitializedHostDb !== cacheKey) {
    await sql`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'general',
        source_url VARCHAR(500),
        license VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general';
    `;

    // Sincroniza agentes nativos do repositório (sem sobrescrever edições já feitas no banco)
    const bundled = loadBundledAgentsFromRepo();
    for (const agent of bundled) {
      await sql`
        INSERT INTO agents (name, title, content, file_name, category, license, updated_at)
        VALUES (
          ${agent.name},
          ${agent.title},
          ${agent.content},
          ${agent.fileName},
          ${agent.category},
          ${agent.license},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (name) DO NOTHING;
      `;
    }

    lastInitializedHostDb = cacheKey;
  }

  return resolved;
}

export function detectAgentCategory(
  name: string,
  content: string,
  explicitCategory?: string
): string {
  if (explicitCategory && explicitCategory.trim().length > 0) {
    const clean = explicitCategory.trim().toLowerCase();
    const valid = [
      'design',
      'development',
      'architecture',
      'security',
      'data',
      'orchestration',
      'general',
    ];
    if (valid.includes(clean)) return clean;
  }

  // Check frontmatter category / categoria
  const fmCatMatch = content.match(/^(?:category|categoria):\s*([a-zA-Z0-9_-]+)/im);
  if (fmCatMatch) {
    const rawCat = fmCatMatch[1].trim().toLowerCase();
    const map: Record<string, string> = {
      design: 'design',
      ui: 'design',
      ux: 'design',
      frontend: 'design',
      development: 'development',
      dev: 'development',
      codigo: 'development',
      architecture: 'architecture',
      cloud: 'architecture',
      infra: 'architecture',
      security: 'security',
      seguranca: 'security',
      review: 'security',
      data: 'data',
      dados: 'data',
      ai: 'data',
      ml: 'data',
      orchestration: 'orchestration',
      orquestracao: 'orchestration',
      mcp: 'orchestration',
      general: 'general',
      geral: 'general',
    };
    if (map[rawCat]) return map[rawCat];
  }

  const textToScan = `${name} ${content.slice(0, 1500)}`.toLowerCase();

  // 1. Design & UI/UX
  if (
    /(designer|akiom|ui\/ux|design-system|design system|tailwind|css|prototip|interface|responsiv|estil|paleta|figma|glassmorphism)/i.test(
      textToScan
    )
  ) {
    return 'design';
  }

  // 2. Security & Review
  if (
    /(security|seguranc|review|reviewer|owasp|auditor|pentest|compliance|vulnerabilidade|juridic|licenca|cve)/i.test(
      textToScan
    )
  ) {
    return 'security';
  }

  // 3. Architecture & Cloud
  if (
    /(architect|arquitet|cloud|neon|postgres|database|banco de dados|infra|devops|docker|kubernetes|aws|vercel|storage|microsservi)/i.test(
      textToScan
    )
  ) {
    return 'architecture';
  }

  // 4. Data & AI/ML
  if (
    /(timesfm|forecast|machine learning|deep learning|data science|dados|pandas|numpy|analytics|dataset|inteligencia artificial|redes neurais)/i.test(
      textToScan
    )
  ) {
    return 'data';
  }

  // 5. Orchestration & MCP
  if (
    /(orchestrat|orquestra|mcp|subagent|teamwork|sentinel|workflow|pipeline|maestro|coordenador)/i.test(
      textToScan
    )
  ) {
    return 'orchestration';
  }

  // 6. Development
  if (
    /(dev|developer|desenvolvedor|fullstack|backend|frontend|api|typescript|nextjs|react|javascript|python|codigo|software|engenhari)/i.test(
      textToScan
    )
  ) {
    return 'development';
  }

  return 'general';
}

export function parseAgentDetails(
  content: string,
  name: string,
  explicitCategory?: string
) {
  const titleMatch = content.match(/^#+\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\(`.*`\)/, '').trim() : name;

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
      whatItDoes = pMatch
        ? pMatch[1].trim()
        : 'Agente especializado pronto para execução de tarefas no chat.';
    }
  }

  const whenMatch = content.match(/##\s*Quando Usar\s*([\s\S]*?)(?=\n##|$)/i);
  const whenToUse = whenMatch
    ? whenMatch[1].trim()
    : 'Invoque no chat quando precisar de auxílio especializado nesta área.';

  const category = detectAgentCategory(name, content, explicitCategory);

  let tags: string[] = [];
  switch (category) {
    case 'design':
      tags = ['Design System', 'UI/UX', 'Akiom', 'Tailwind CSS'];
      break;
    case 'development':
      tags = ['Fullstack', 'TypeScript', 'Clean Code', 'Engenharia'];
      break;
    case 'architecture':
      tags = ['Arquitetura', 'Neon PostgreSQL', 'Cloud', 'Microsserviços'];
      break;
    case 'security':
      tags = ['Segurança', 'Code Review', 'OWASP', 'Conformidade'];
      break;
    case 'data':
      tags = ['Machine Learning', 'TimesFM', 'Análise Preditiva', 'Dados'];
      break;
    case 'orchestration':
      tags = ['MCP Server', 'Orquestrador', 'Multi-Agente', 'Automação'];
      break;
    default:
      tags = ['Agente Markdown', 'Produtividade', 'Especialista'];
      break;
  }

  return { title, whatItDoes, whenToUse, tags, category };
}

export async function upsertAgentInDb(params: {
  name: string;
  title: string;
  content: string;
  fileName: string;
  category?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
}): Promise<{ row: DbAgent; dbMeta: ResolvedDbEnv }> {
  const resolved = await initDb();
  if (!resolved) {
    throw new Error('Nenhuma variável de conexão com o Neon encontrada no ambiente.');
  }

  const category = params.category || detectAgentCategory(params.name, params.content);

  const sql = neon(resolved.connectionString);
  const rows = await sql`
    INSERT INTO agents (name, title, content, file_name, category, source_url, license, updated_at)
    VALUES (
      ${params.name},
      ${params.title},
      ${params.content},
      ${params.fileName},
      ${category},
      ${params.sourceUrl || null},
      ${params.license || null},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (name) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      file_name = EXCLUDED.file_name,
      category = COALESCE(EXCLUDED.category, agents.category, 'general'),
      source_url = COALESCE(EXCLUDED.source_url, agents.source_url),
      license = COALESCE(EXCLUDED.license, agents.license),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, name, title, content, file_name, category, source_url, license, created_at, updated_at;
  `;

  if (!rows || rows.length === 0) {
    throw new Error('INSERT executou no Neon, mas nenhuma linha foi confirmada pelo RETURNING.');
  }

  return {
    row: rows[0] as DbAgent,
    dbMeta: resolved,
  };
}

/**
 * Atualiza o frontmatter YAML de um arquivo markdown substituindo ou adicionando `category: <newCategory>`.
 */
export function updateMarkdownFrontmatterCategory(content: string, newCategory: string): string {
  if (/^---\r?\n/m.test(content)) {
    if (/^category:\s*.*$/mi.test(content)) {
      return content.replace(/^category:\s*.*$/mi, `category: ${newCategory}`);
    } else {
      return content.replace(/^---\r?\n/, `---\ncategory: ${newCategory}\n`);
    }
  } else {
    return `---\ncategory: ${newCategory}\n---\n\n${content}`;
  }
}

/**
 * Atualiza a categoria de um agente no banco de dados Neon PostgreSQL.
 */
export async function updateAgentCategoryInDb(
  name: string,
  category: string
): Promise<{ row: DbAgent; dbMeta: ResolvedDbEnv }> {
  const resolved = await initDb();
  if (!resolved) {
    throw new Error('Nenhuma variável de conexão com o Neon encontrada no ambiente.');
  }

  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-|-$/g, '');
  const validCategory = detectAgentCategory(cleanName, '', category);

  const sql = neon(resolved.connectionString);
  const rows = await sql`
    UPDATE agents
    SET category = ${validCategory}, updated_at = CURRENT_TIMESTAMP
    WHERE name = ${cleanName}
    RETURNING id, name, title, content, file_name, category, source_url, license, created_at, updated_at;
  `;

  if (!rows || rows.length === 0) {
    throw new Error(`Agente '${cleanName}' não encontrado no banco de dados Neon.`);
  }

  return {
    row: rows[0] as DbAgent,
    dbMeta: resolved,
  };
}

/**
 * Atualiza o arquivo markdown local em `agents/` caso exista no ambiente Node.
 */
export function updateLocalAgentFileCategory(name: string, newCategory: string): boolean {
  try {
    if (typeof process === 'undefined' || typeof (process as any).getBuiltinModule !== 'function') {
      return false;
    }
    const fs = (process as any).getBuiltinModule('node:fs') as typeof import('node:fs');
    const path = (process as any).getBuiltinModule('node:path') as typeof import('node:path');
    if (!fs || !path) return false;

    const dirsToCheck = [
      path.join(process.cwd(), 'agents'),
      path.join(process.cwd(), '.agents', 'agents'),
    ];

    let updated = false;
    for (const dir of dirsToCheck) {
      const filePath = path.join(dir, `${name}.md`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const newContent = updateMarkdownFrontmatterCategory(content, newCategory);
        fs.writeFileSync(filePath, newContent, 'utf-8');
        updated = true;
      }
    }
    return updated;
  } catch {
    return false;
  }
}

export async function checkDbStatus(forceInitTable = true): Promise<DbStatusResult> {
  const resolved = resolveDatabaseEnv();

  if (!resolved) {
    return {
      connected: false,
      configured: false,
      message:
        'Nenhuma variável de banco (DATABASE_URL, POSTGRES_URL ou AGENTS_MPG_DATABASE_URL) foi encontrada nas variáveis de ambiente.',
    };
  }

  const metaCheck = extractConnectionMeta(resolved.connectionString);
  if (!metaCheck.validFormat) {
    return {
      connected: false,
      configured: true,
      envVarName: resolved.envVarName,
      host: resolved.host,
      databaseName: resolved.databaseName,
      error: `O valor da variável ${resolved.envVarName} não é uma URL PostgreSQL válida (esperado: postgresql://usuario:senha@host/banco?sslmode=require).`,
      message: 'Formato inválido na Connection String configurada.',
    };
  }

  try {
    const sql = neon(resolved.connectionString);
    if (forceInitTable) {
      lastInitializedHostDb = null;
      await initDb();
    }

    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'agents'
      ) AS table_exists;
    `;
    const tableExists = Boolean(tableCheck[0]?.table_exists);

    let agentCount = 0;
    let timestamp = '';
    if (tableExists) {
      const countRes = await sql`SELECT NOW()::text as now, count(*)::int as count FROM agents;`;
      timestamp = String(countRes[0]?.now || '');
      agentCount = Number(countRes[0]?.count ?? 0);
    }

    return {
      connected: true,
      configured: true,
      envVarName: resolved.envVarName,
      host: resolved.host,
      databaseName: resolved.databaseName,
      tableExists,
      agentCount,
      timestamp,
      message: `Conectado ao Neon (${resolved.databaseName} em ${resolved.host}) via ${resolved.envVarName}.`,
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      envVarName: resolved.envVarName,
      host: resolved.host,
      databaseName: resolved.databaseName,
      error: err instanceof Error ? err.message : String(err),
      message: `Falha ao conectar ou criar tabela no Neon via ${resolved.envVarName}.`,
    };
  }
}
