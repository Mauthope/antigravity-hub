import { z } from 'zod';

/**
 * Strict legal compliance: ONLY MIT and Apache-2.0 licenses permitted.
 * Zero legal risk policy.
 */
export const ALLOWED_LICENSES = ['MIT', 'Apache-2.0'] as const;
export type AllowedLicense = typeof ALLOWED_LICENSES[number];

export interface LicenseVerificationResult {
  valid: boolean;
  license?: string;
  spdxId?: string;
  source: 'api' | 'license_file' | 'spdx_header' | 'none';
  error?: string;
  rawUrl?: string;
}

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Skill name must only contain alphanumeric characters, underscores or hyphens'),
  description: z.string().min(5, 'Description should be descriptive'),
  license: z.string().optional(),
  author: z.string().optional(),
  repository: z.string().optional(),
  version: z.string().optional().default('1.0.0'),
  tags: z.array(z.string()).optional().default([]),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface SkillDefinition {
  frontmatter: SkillFrontmatter;
  instructions: string;
  rawContent: string;
  files?: Record<string, string>; // relative path -> content (for scripts, references, assets)
  sourceUrl?: string;
  licenseResult?: LicenseVerificationResult;
}

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Agent name must be alphanumeric with dashes or underscores'),
  role: z.string().min(3),
  description: z.string().min(5),
  system_prompt: z.string().min(10),
  tools: z.object({
    write: z.boolean().default(true),
    subagents: z.boolean().default(true),
    mcp: z.boolean().default(true),
  }).default({ write: true, subagents: true, mcp: true }),
  skills: z.array(z.string()).default([]),
  mcp_servers: z.array(z.string()).default([]),
  model: z.string().default('inherit'),
  version: z.string().default('1.0.0'),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const McpServerDefinitionSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
  type: z.enum(['stdio', 'sse']).default('stdio'),
  description: z.string().optional(),
});

export type McpServerDefinition = z.infer<typeof McpServerDefinitionSchema>;

export interface McpConfigFile {
  mcpServers: Record<string, McpServerDefinition>;
}

export interface HubPaths {
  workspaceRoot: string;
  localAgentsDir: string;
  localSkillsDir: string;
  localMcpFile: string;
  globalConfigDir: string;
  globalSkillsDir: string;
  globalAgentsDir: string;
  globalMcpFile: string;
}
