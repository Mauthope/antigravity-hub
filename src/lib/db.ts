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
