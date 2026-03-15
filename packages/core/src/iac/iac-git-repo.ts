/**
 * IaC Git Repository — discovers IaC templates from a local git repo.
 *
 * Each subdirectory under `templateDir` is treated as a template.
 * A `template.json` metadata file is expected in each.
 */

import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { promisify } from 'node:util';
import type {
  IacRepoConfig,
  IacTool,
  IacCloudProvider,
  IacCategory,
  IacVariable,
} from '@secureyeoman/shared';

const execFileAsync = promisify(execFile);

export interface DiscoveredTemplate {
  name: string;
  dir: string;
  tool: IacTool;
  cloudProvider: IacCloudProvider;
  category: IacCategory;
  version: string;
  description: string;
  variables: IacVariable[];
  tags: string[];
  sraControlIds: string[];
  policyBundleName?: string;
  files: { path: string; content: string }[];
}

export interface GitInfo {
  commitSha: string;
  branch: string;
  shortSha: string;
}

/** File extensions recognized per IaC tool. */
const TOOL_EXTENSIONS: Record<IacTool, string[]> = {
  terraform: ['.tf', '.tf.json', '.tfvars'],
  cloudformation: ['.yaml', '.yml', '.json'],
  pulumi: ['.ts', '.js', '.py', '.go', '.yaml'],
  helm: ['.yaml', '.yml', '.tpl'],
  bicep: ['.bicep', '.json'],
  ansible: ['.yaml', '.yml'],
  kubernetes: ['.yaml', '.yml', '.json'],
  cdk: ['.ts', '.js', '.py', '.java', '.cs', '.json'],
};

/** Detect IaC tool from directory contents. */
function detectTool(files: string[]): IacTool {
  if (files.some((f) => f.endsWith('.tf'))) return 'terraform';
  if (files.some((f) => f === 'Chart.yaml')) return 'helm';
  if (files.some((f) => f === 'Pulumi.yaml')) return 'pulumi';
  if (files.some((f) => f === 'cdk.json')) return 'cdk';
  if (files.some((f) => f.endsWith('.bicep'))) return 'bicep';
  if (files.some((f) => f.includes('playbook') || f.includes('ansible'))) return 'ansible';
  if (
    files.some((f) => {
      // Read content would be needed for full detection
      return f.endsWith('.yaml') || f.endsWith('.yml');
    })
  )
    return 'kubernetes';
  return 'terraform'; // default
}

export class IacGitRepo {
  private readonly repoPath: string;
  private readonly templateDir: string;
  private readonly branch: string;

  constructor(config: IacRepoConfig) {
    this.repoPath = config.repoPath;
    this.templateDir = config.templateDir;
    this.branch = config.branch;
  }

  async getGitInfo(): Promise<GitInfo> {
    try {
      const [shaResult, branchResult] = await Promise.all([
        execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: this.repoPath }),
        execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.repoPath }),
      ]);
      const commitSha = shaResult.stdout.trim();
      return { commitSha, branch: branchResult.stdout.trim(), shortSha: commitSha.slice(0, 8) };
    } catch {
      return { commitSha: '', branch: this.branch, shortSha: '' };
    }
  }

  async pull(): Promise<{ updated: boolean; commitSha: string }> {
    const before = await this.getGitInfo();
    try {
      await execFileAsync('git', ['pull', '--ff-only', 'origin', this.branch], {
        cwd: this.repoPath,
      });
    } catch (err) {
      throw new Error(`Git pull failed: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    const after = await this.getGitInfo();
    return { updated: before.commitSha !== after.commitSha, commitSha: after.commitSha };
  }

  async discoverTemplates(): Promise<DiscoveredTemplate[]> {
    const templatesRoot = join(this.repoPath, this.templateDir);

    let entries: string[];
    try {
      entries = await readdir(templatesRoot);
    } catch {
      return [];
    }

    const templates: DiscoveredTemplate[] = [];

    for (const entry of entries) {
      const templatePath = join(templatesRoot, entry);
      const s = await stat(templatePath).catch(() => null);
      if (!s?.isDirectory()) continue;

      try {
        const template = await this.readTemplate(entry, templatePath);
        templates.push(template);
      } catch {
        // Skip invalid templates
      }
    }

    return templates;
  }

  private async readTemplate(name: string, dir: string): Promise<DiscoveredTemplate> {
    // Read metadata from template.json
    let meta: Record<string, unknown> = {};
    try {
      const raw = await readFile(join(dir, 'template.json'), 'utf-8');
      meta = JSON.parse(raw);
    } catch {
      // Use defaults
    }

    // Discover all files
    const files = await this.discoverFiles(dir, dir);
    const filenames = files.map((f) => f.path);

    const tool = (meta.tool as IacTool) ?? detectTool(filenames);
    const validExtensions = TOOL_EXTENSIONS[tool] ?? [];

    // Filter to relevant files
    const relevantFiles = files.filter((f) => {
      const ext = extname(f.path).toLowerCase();
      return (
        validExtensions.some((ve) => f.path.endsWith(ve)) ||
        ext === '.json' ||
        f.path === 'template.json' ||
        f.path === 'README.md'
      );
    });

    return {
      name,
      dir,
      tool,
      cloudProvider: (meta.cloudProvider as IacCloudProvider) ?? 'generic',
      category: (meta.category as IacCategory) ?? 'other',
      version: (meta.version as string) ?? '0.0.0',
      description: (meta.description as string) ?? '',
      variables: Array.isArray(meta.variables) ? (meta.variables as IacVariable[]) : [],
      tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
      sraControlIds: Array.isArray(meta.sraControlIds) ? (meta.sraControlIds as string[]) : [],
      policyBundleName: (meta.policyBundleName as string) ?? undefined,
      files: relevantFiles,
    };
  }

  private async discoverFiles(
    rootDir: string,
    currentDir: string
  ): Promise<{ path: string; content: string }[]> {
    const entries = await readdir(currentDir);
    const files: { path: string; content: string }[] = [];

    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules' || entry === '.terraform') continue;

      const fullPath = join(currentDir, entry);
      const s = await stat(fullPath).catch(() => null);
      if (!s) continue;

      if (s.isDirectory()) {
        const subFiles = await this.discoverFiles(rootDir, fullPath);
        files.push(...subFiles);
        continue;
      }

      // Skip binary and large files
      if (s.size > 512_000) continue;

      const content = await readFile(fullPath, 'utf-8').catch(() => null);
      if (content !== null) {
        const relPath = relative(rootDir, fullPath);
        files.push({ path: relPath, content });
      }
    }

    return files;
  }
}
