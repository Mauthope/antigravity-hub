#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHubMcpServer } from './server.js';

async function main() {
  const server = createHubMcpServer();
  const transport = new StdioServerTransport();

  // Handle termination signals
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((err) => {
  console.error('[Antigravity Hub MCP Server] Fatal error:', err);
  process.exit(1);
});
