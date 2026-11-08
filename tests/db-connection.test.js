import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeConnectionString,
  extractConnectionMeta,
  resolveDatabaseEnv,
  checkDbStatus,
} from '../dist/lib/db.js';

describe('Neon PostgreSQL Connection Sanitizer & Diagnostics', () => {
  test('Deve limpar comando psql com aspas simples copiado direto do painel da Neon', () => {
    const raw =
      "psql 'postgresql://neondb_owner:npg_abc123@ep-shiny-moon-1234.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'";
    const clean = sanitizeConnectionString(raw);
    assert.equal(
      clean,
      'postgresql://neondb_owner:npg_abc123@ep-shiny-moon-1234.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
    );
  });

  test('Deve remover aspas duplas, quebras de linha e espacos extras ao redor da URL', () => {
    const raw =
      '\n  "postgres://user:secret@ep-quiet-river.aws.neon.tech/agents_mpg?sslmode=require"  \r\n';
    const clean = sanitizeConnectionString(raw);
    assert.equal(
      clean,
      'postgres://user:secret@ep-quiet-river.aws.neon.tech/agents_mpg?sslmode=require'
    );
  });

  test('Deve extrair URL mesmo quando houver flag -d do psql', () => {
    const raw = "psql -d 'postgresql://user:pass@ep-test.aws.neon.tech/agents_mpg'";
    const clean = sanitizeConnectionString(raw);
    assert.equal(clean, 'postgresql://user:pass@ep-test.aws.neon.tech/agents_mpg');
  });

  test('Deve extrair host e databaseName com seguranca e validar formato', () => {
    const meta = extractConnectionMeta(
      'postgresql://neondb_owner:segredo@ep-cool-star.us-east-2.aws.neon.tech/neondb?sslmode=require'
    );
    assert.equal(meta.validFormat, true);
    assert.equal(meta.host, 'ep-cool-star.us-east-2.aws.neon.tech');
    assert.equal(meta.databaseName, 'neondb');

    const badMeta = extractConnectionMeta('apenas-um-texto-invalido');
    assert.equal(badMeta.validFormat, false);
  });

  test('Deve detectar variaveis prefixadas da Vercel Storage (ex: AGENTS_MPG_DATABASE_URL)', () => {
    const resolvedPrefixed = resolveDatabaseEnv({
      AGENTS_MPG_DATABASE_URL:
        "psql 'postgresql://owner:pw@ep-mpg.aws.neon.tech/neondb?sslmode=require'",
    });
    assert.ok(resolvedPrefixed);
    assert.equal(resolvedPrefixed.envVarName, 'AGENTS_MPG_DATABASE_URL');
    assert.equal(resolvedPrefixed.host, 'ep-mpg.aws.neon.tech');
    assert.equal(resolvedPrefixed.databaseName, 'neondb');
    assert.ok(resolvedPrefixed.connectionString.startsWith('postgresql://'));

    const resolvedCustom = resolveDatabaseEnv({
      CUSTOM_NEON_POSTGRES_URL: 'postgresql://owner:pw@ep-custom.aws.neon.tech/agents_mpg',
    });
    assert.ok(resolvedCustom);
    assert.equal(resolvedCustom.envVarName, 'CUSTOM_NEON_POSTGRES_URL');
    assert.equal(resolvedCustom.databaseName, 'agents_mpg');

    const resolvedEmpty = resolveDatabaseEnv({});
    assert.equal(resolvedEmpty, null);
  });

  test('checkDbStatus nunca deve retornar falso positivo quando DATABASE_URL for invalida ou ausente', async () => {
    const prevUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      const unconfigured = await checkDbStatus(false);
      assert.equal(unconfigured.connected, false);
      assert.equal(unconfigured.configured, false);

      process.env.DATABASE_URL = 'string-invalida-sem-protocolo';
      const invalidConfig = await checkDbStatus(false);
      assert.equal(invalidConfig.connected, false);
      assert.equal(invalidConfig.configured, true);
      assert.ok(invalidConfig.error);
    } finally {
      if (prevUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = prevUrl;
      }
    }
  });
});
