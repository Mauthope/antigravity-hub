import { neon } from '@neondatabase/serverless';

export interface DbAgent {
  id?: number;
  name: string;
  title: string;
  content: string;
  file_name: string;
  source_url?: string;
  license?: string;
  created_at?: string;
  updated_at?: string;
}

let tableInitialized = false;

export function getDb() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  return neon(connectionString);
}

export async function initDb() {
  if (tableInitialized) return;
  const sql = getDb();
  if (!sql) return;

  try {
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
    tableInitialized = true;
  } catch (err) {
    console.warn('Aviso: Falha ao inicializar tabela no Neon:', err);
  }
}

export async function checkDbStatus() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL;

  if (!connectionString) {
    return {
      connected: false,
      configured: false,
      message: 'DATABASE_URL não foi encontrada nas variáveis de ambiente da Vercel.',
    };
  }

  const sql = getDb();
  if (!sql) {
    return {
      connected: false,
      configured: true,
      message: 'Driver Neon não pôde ser instanciado.',
    };
  }

  try {
    await initDb();
    const result = await sql`SELECT NOW() as now, count(*)::int as count FROM agents;`;
    return {
      connected: true,
      configured: true,
      timestamp: result[0]?.now,
      agentCount: result[0]?.count ?? 0,
      message: 'Conexão com Neon PostgreSQL ativa e saudável.',
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
      message: 'Falha ao executar query no Neon PostgreSQL.',
    };
  }
}

