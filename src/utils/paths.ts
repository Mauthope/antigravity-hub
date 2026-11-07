import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { HubPaths } from '../types/index.js';

export function resolveHubPaths(customWorkspace?: string): HubPaths {
  const homeDir = os.homedir();
  const workspaceRoot = customWorkspace || process.cwd();

  // Local workspace paths
  const localAgentsDir = path.join(workspaceRoot, '.agents');
  const localSkillsDir = path.join(localAgentsDir, 'skills');
  const localMcpFile = path.join(localAgentsDir, 'mcp.json');

  // Global Antigravity paths (~/.gemini/config)
  const globalConfigDir = path.join(homeDir, '.gemini', 'config');
  const globalSkillsDir = path.join(globalConfigDir, 'skills');
  const globalAgentsDir = path.join(globalConfigDir, 'agents');
  const globalMcpFile = path.join(globalConfigDir, 'mcp.json');

  return {
    workspaceRoot,
    localAgentsDir,
    localSkillsDir,
    localMcpFile,
    globalConfigDir,
    globalSkillsDir,
    globalAgentsDir,
    globalMcpFile,
  };
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
