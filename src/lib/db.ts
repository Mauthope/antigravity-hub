import { neon } from '@neondatabase/serverless';

export interface DbAgent {
  id?: number;
  name: string;
  title: string;
  content: string;
  file_name: string;
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
 * Cria a tabela `agents` se não existir. Propaga erros reais caso a conexão
 * ou permissão falhe (sem engolir exceções silenciosamente).
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
        source_url VARCHAR(500),
        license VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    lastInitializedHostDb = cacheKey;
  }

  return resolved;
}

export function parseAgentDetails(content: string, name: string) {
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

export async function upsertAgentInDb(params: {
  name: string;
  title: string;
  content: string;
  fileName: string;
  sourceUrl?: string | null;
  license?: string | null;
}): Promise<{ row: DbAgent; dbMeta: ResolvedDbEnv }> {
  const resolved = await initDb();
  if (!resolved) {
    throw new Error('Nenhuma variável de conexão com o Neon encontrada no ambiente.');
  }

  const sql = neon(resolved.connectionString);
  const rows = await sql`
    INSERT INTO agents (name, title, content, file_name, source_url, license, updated_at)
    VALUES (
      ${params.name},
      ${params.title},
      ${params.content},
      ${params.fileName},
      ${params.sourceUrl || null},
      ${params.license || null},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (name) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      file_name = EXCLUDED.file_name,
      source_url = COALESCE(EXCLUDED.source_url, agents.source_url),
      license = COALESCE(EXCLUDED.license, agents.license),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, name, title, content, file_name, source_url, license, created_at, updated_at;
  `;

  if (!rows || rows.length === 0) {
    throw new Error('INSERT executou no Neon, mas nenhuma linha foi confirmada pelo RETURNING.');
  }

  return {
    row: rows[0] as DbAgent,
    dbMeta: resolved,
  };
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
