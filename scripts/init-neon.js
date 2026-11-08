#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';

function sanitizeUrl(raw) {
  let clean = String(raw || '').replace(/[\r\n]+/g, ' ').trim();
  if (/^psql\s+/i.test(clean)) {
    clean = clean.replace(/^psql\s+/i, '').trim();
  }
  clean = clean.replace(/^['"`]+|['"`]+$/g, '').trim();
  const match = clean.match(/(postgres(?:ql)?:\/\/[^\s'"`]+)/i);
  return match ? match[1] : clean;
}

const rawInput =
  process.argv[2] ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.AGENTS_MPG_DATABASE_URL ||
  process.env.AGENTS_MPG_POSTGRES_URL;

const connectionString = sanitizeUrl(rawInput);

if (!connectionString) {
  console.error('\n[ERRO] Nenhuma Connection String informada.');
  console.log(
    'Uso: node scripts/init-neon.js "postgresql://usuario:senha@ep-xyz.aws.neon.tech/neondb?sslmode=require"'
  );
  process.exit(1);
}

async function run() {
  console.log('\n[INFO] Conectando ao Neon PostgreSQL...');
  const sql = neon(connectionString);

  console.log('[INFO] Criando tabela `agents` no Neon se nao existir...');
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

  const result = await sql`SELECT current_database() as db, NOW() as now, count(*)::int as count FROM agents;`;
  console.log('[OK] Tabela `agents` criada e verificada com sucesso no Neon!');
  console.log(`   - Database ativa: ${result[0].db}`);
  console.log(`   - Data/Hora do Banco: ${result[0].now}`);
  console.log(`   - Total de agentes salvos: ${result[0].count}\n`);
}

run().catch((err) => {
  console.error('[ERRO] Falha ao conectar ou criar tabela no Neon:', err.message);
  process.exit(1);
});
