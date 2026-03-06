/**
 * IaC Validator — validates infrastructure-as-code templates.
 *
 * Performs syntax and structural validation for Terraform HCL,
 * CloudFormation YAML/JSON, Pulumi configs, Helm charts,
 * Kubernetes manifests, and Bicep/ARM templates.
 */

import { createHash } from 'node:crypto';
import type {
  IacTool,
  IacTemplateFile,
  IacValidationResult,
  IacConfig,
} from '@secureyeoman/shared';

export class IacValidator {
  constructor(private readonly config: IacConfig) {}

  /**
   * Validate template files for a given IaC tool.
   */
  validate(tool: IacTool, files: { path: string; content: string }[]): IacValidationResult {
    const start = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Size checks
    for (const file of files) {
      const sizeBytes = Buffer.byteLength(file.content, 'utf-8');
      if (sizeBytes > this.config.maxFileSizeBytes) {
        errors.push(
          `${file.path}: exceeds max size (${sizeBytes} > ${this.config.maxFileSizeBytes} bytes)`
        );
      }
    }

    if (files.length > this.config.maxTemplateFiles) {
      errors.push(`Template exceeds max files (${files.length} > ${this.config.maxTemplateFiles})`);
    }

    // Tool-specific validation
    switch (tool) {
      case 'terraform':
        this.validateTerraform(files, errors, warnings);
        break;
      case 'cloudformation':
        this.validateCloudFormation(files, errors, warnings);
        break;
      case 'pulumi':
        this.validatePulumi(files, errors, warnings);
        break;
      case 'helm':
        this.validateHelm(files, errors, warnings);
        break;
      case 'kubernetes':
        this.validateKubernetes(files, errors, warnings);
        break;
      case 'bicep':
        this.validateBicep(files, errors, warnings);
        break;
      case 'ansible':
        this.validateAnsible(files, errors, warnings);
        break;
      case 'cdk':
        this.validateCdk(files, errors, warnings);
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      tool,
      fileCount: files.length,
      durationMs: Date.now() - start,
    };
  }

  /** Validate Terraform HCL files. */
  private validateTerraform(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const tfFiles = files.filter((f) => f.path.endsWith('.tf') || f.path.endsWith('.tf.json'));
    if (tfFiles.length === 0) {
      errors.push('No .tf or .tf.json files found');
      return;
    }

    for (const file of tfFiles) {
      if (file.path.endsWith('.tf')) {
        // HCL structural checks
        this.checkBraceBalance(file.path, file.content, errors);

        // Check for required blocks in main.tf
        if (file.path.includes('main.tf') || file.path.endsWith('main.tf')) {
          if (
            !file.content.includes('resource ') &&
            !file.content.includes('module ') &&
            !file.content.includes('data ')
          ) {
            warnings.push(`${file.path}: no resource, module, or data blocks found`);
          }
        }

        // Check for provider block
        if (file.path.includes('provider') || file.path.endsWith('providers.tf')) {
          if (!file.content.includes('provider ')) {
            warnings.push(`${file.path}: no provider block found`);
          }
        }

        // Detect hardcoded secrets
        this.checkHardcodedSecrets(file.path, file.content, warnings);
      }
    }

    // Check for backend configuration
    const hasBackend = files.some((f) => f.content.includes('backend '));
    if (!hasBackend) {
      warnings.push('No backend configuration found — state will be stored locally');
    }
  }

  /** Validate CloudFormation templates. */
  private validateCloudFormation(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const cfnFiles = files.filter(
      (f) => f.path.endsWith('.yaml') || f.path.endsWith('.yml') || f.path.endsWith('.json')
    );
    if (cfnFiles.length === 0) {
      errors.push('No YAML/JSON template files found');
      return;
    }

    for (const file of cfnFiles) {
      // Check for AWSTemplateFormatVersion or Resources section
      if (file.path.endsWith('.json')) {
        this.checkJsonSyntax(file.path, file.content, errors);
        if (
          !file.content.includes('"Resources"') &&
          !file.content.includes('"AWSTemplateFormatVersion"')
        ) {
          warnings.push(`${file.path}: missing Resources or AWSTemplateFormatVersion`);
        }
      } else {
        // YAML checks
        if (
          !file.content.includes('Resources:') &&
          !file.content.includes('AWSTemplateFormatVersion:')
        ) {
          warnings.push(`${file.path}: missing Resources or AWSTemplateFormatVersion`);
        }
        this.checkYamlIndentation(file.path, file.content, warnings);
      }

      this.checkHardcodedSecrets(file.path, file.content, warnings);
    }
  }

  /** Validate Pulumi project files. */
  private validatePulumi(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const hasPulumiYaml = files.some(
      (f) => f.path === 'Pulumi.yaml' || f.path.endsWith('/Pulumi.yaml')
    );
    if (!hasPulumiYaml) {
      errors.push('Missing Pulumi.yaml project file');
      return;
    }

    const hasIndex = files.some(
      (f) =>
        f.path.endsWith('index.ts') ||
        f.path.endsWith('index.js') ||
        f.path.endsWith('__main__.py') ||
        f.path.endsWith('main.go')
    );
    if (!hasIndex) {
      warnings.push('No entry point file found (index.ts, index.js, __main__.py, main.go)');
    }

    for (const file of files) {
      this.checkHardcodedSecrets(file.path, file.content, warnings);
    }
  }

  /** Validate Helm chart structure. */
  private validateHelm(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const hasChartYaml = files.some(
      (f) => f.path === 'Chart.yaml' || f.path.endsWith('/Chart.yaml')
    );
    if (!hasChartYaml) {
      errors.push('Missing Chart.yaml');
      return;
    }

    const hasTemplatesDir = files.some((f) => f.path.includes('templates/'));
    if (!hasTemplatesDir) {
      warnings.push('No templates/ directory found');
    }

    const hasValues = files.some(
      (f) => f.path === 'values.yaml' || f.path.endsWith('/values.yaml')
    );
    if (!hasValues) {
      warnings.push('No values.yaml found');
    }
  }

  /** Validate Kubernetes manifests. */
  private validateKubernetes(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const yamlFiles = files.filter((f) => f.path.endsWith('.yaml') || f.path.endsWith('.yml'));
    if (yamlFiles.length === 0) {
      errors.push('No YAML manifest files found');
      return;
    }

    for (const file of yamlFiles) {
      if (!file.content.includes('apiVersion:') || !file.content.includes('kind:')) {
        warnings.push(`${file.path}: missing apiVersion or kind field`);
      }
      this.checkHardcodedSecrets(file.path, file.content, warnings);
    }
  }

  /** Validate Bicep/ARM templates. */
  private validateBicep(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const bicepFiles = files.filter((f) => f.path.endsWith('.bicep'));
    const armFiles = files.filter((f) => f.path.endsWith('.json'));

    if (bicepFiles.length === 0 && armFiles.length === 0) {
      errors.push('No .bicep or .json ARM template files found');
      return;
    }

    for (const file of bicepFiles) {
      if (!file.content.includes('resource ') && !file.content.includes('module ')) {
        warnings.push(`${file.path}: no resource or module declarations found`);
      }
    }

    for (const file of armFiles) {
      this.checkJsonSyntax(file.path, file.content, errors);
    }
  }

  /** Validate Ansible playbooks. */
  private validateAnsible(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const yamlFiles = files.filter((f) => f.path.endsWith('.yaml') || f.path.endsWith('.yml'));
    if (yamlFiles.length === 0) {
      errors.push('No YAML playbook files found');
      return;
    }

    for (const file of yamlFiles) {
      if (
        !file.content.includes('hosts:') &&
        !file.content.includes('tasks:') &&
        !file.content.includes('roles:')
      ) {
        warnings.push(`${file.path}: does not appear to be a playbook (missing hosts/tasks/roles)`);
      }
    }
  }

  /** Validate CDK project. */
  private validateCdk(
    files: { path: string; content: string }[],
    errors: string[],
    warnings: string[]
  ): void {
    const hasCdkJson = files.some((f) => f.path === 'cdk.json' || f.path.endsWith('/cdk.json'));
    if (!hasCdkJson) {
      errors.push('Missing cdk.json');
      return;
    }

    const hasEntry = files.some(
      (f) =>
        f.path.endsWith('.ts') ||
        f.path.endsWith('.py') ||
        f.path.endsWith('.java') ||
        f.path.endsWith('.cs')
    );
    if (!hasEntry) {
      warnings.push('No source files found for CDK stack');
    }
  }

  // ─── Utility checks ────────────────────────────────────────────────

  /** Check that braces/brackets are balanced. */
  private checkBraceBalance(path: string, content: string, errors: string[]): void {
    let braces = 0;
    let brackets = 0;
    for (const ch of content) {
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }
    if (braces !== 0) errors.push(`${path}: unbalanced braces ({/})`);
    if (brackets !== 0) errors.push(`${path}: unbalanced brackets ([/])`);
  }

  /** Check JSON syntax. */
  private checkJsonSyntax(path: string, content: string, errors: string[]): void {
    try {
      JSON.parse(content);
    } catch (err) {
      errors.push(`${path}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Warn on YAML files with tab indentation. */
  private checkYamlIndentation(path: string, content: string, warnings: string[]): void {
    if (content.includes('\t')) {
      warnings.push(`${path}: contains tab characters (YAML requires spaces)`);
    }
  }

  /** Check for hardcoded secrets / credentials. */
  private checkHardcodedSecrets(path: string, content: string, warnings: string[]): void {
    const secretPatterns = [
      /(?:password|secret|token|api_key|apikey|access_key)\s*[:=]\s*["'][^"']{8,}/i,
      /AKIA[0-9A-Z]{16}/, // AWS access key
      /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        warnings.push(
          `${path}: possible hardcoded secret detected — use variables or a secrets manager`
        );
        break;
      }
    }
  }

  /** Hash file content. */
  static hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
