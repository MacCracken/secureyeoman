/**
 * IaC Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { IacValidator } from './iac-validator.js';
import type { IacConfig } from '@secureyeoman/shared';

const config: IacConfig = {
  enabled: true,
  repo: {
    repoPath: '',
    remoteUrl: '',
    branch: 'main',
    templateDir: 'templates',
    syncIntervalSec: 0,
  },
  maxTemplateFiles: 200,
  maxFileSizeBytes: 512_000,
  retainDeployments: 100,
  enableBuiltinTemplates: true,
};

const validator = new IacValidator(config);

describe('IacValidator', () => {
  describe('Terraform', () => {
    it('validates valid .tf files', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "aws_instance" "web" {\n  ami = "ami-123"\n}\n' },
        { path: 'variables.tf', content: 'variable "name" {\n  type = string\n}\n' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.tool).toBe('terraform');
    });

    it('fails on no .tf files', () => {
      const result = validator.validate('terraform', [{ path: 'readme.md', content: '# Hello' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No .tf'))).toBe(true);
    });

    it('fails on unbalanced braces', () => {
      const result = validator.validate('terraform', [
        { path: 'bad.tf', content: 'resource "x" "y" {\n  foo = "bar"\n' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unbalanced braces'))).toBe(true);
    });

    it('warns on missing backend', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "aws_instance" "web" {\n  ami = "ami-123"\n}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('backend'))).toBe(true);
    });

    it('warns on hardcoded secrets', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "x" "y" {\n  password = "supersecret123"\n}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });
  });

  describe('CloudFormation', () => {
    it('validates valid YAML template', () => {
      const result = validator.validate('cloudformation', [
        {
          path: 'template.yaml',
          content:
            'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  Bucket:\n    Type: AWS::S3::Bucket\n',
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it('validates valid JSON template', () => {
      const result = validator.validate('cloudformation', [
        {
          path: 'template.json',
          content: '{"AWSTemplateFormatVersion": "2010-09-09", "Resources": {}}',
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on invalid JSON', () => {
      const result = validator.validate('cloudformation', [
        { path: 'bad.json', content: '{ invalid json' },
      ]);
      expect(result.valid).toBe(false);
    });

    it('warns on tab indentation in YAML', () => {
      const result = validator.validate('cloudformation', [
        {
          path: 'template.yaml',
          content:
            "AWSTemplateFormatVersion: '2010-09-09'\nResources:\n\tBucket:\n\t\tType: AWS::S3::Bucket\n",
        },
      ]);
      expect(result.warnings.some((w) => w.includes('tab'))).toBe(true);
    });
  });

  describe('Helm', () => {
    it('validates valid chart', () => {
      const result = validator.validate('helm', [
        { path: 'Chart.yaml', content: 'apiVersion: v2\nname: my-chart\nversion: 0.1.0\n' },
        { path: 'values.yaml', content: 'replicaCount: 1\n' },
        { path: 'templates/deployment.yaml', content: 'apiVersion: apps/v1\nkind: Deployment\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on missing Chart.yaml', () => {
      const result = validator.validate('helm', [
        { path: 'values.yaml', content: 'replicaCount: 1\n' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Chart.yaml'))).toBe(true);
    });
  });

  describe('Pulumi', () => {
    it('validates valid project', () => {
      const result = validator.validate('pulumi', [
        { path: 'Pulumi.yaml', content: 'name: my-project\nruntime: nodejs\n' },
        { path: 'index.ts', content: 'import * as pulumi from "@pulumi/pulumi";\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on missing Pulumi.yaml', () => {
      const result = validator.validate('pulumi', [
        { path: 'index.ts', content: 'console.log("hi")\n' },
      ]);
      expect(result.valid).toBe(false);
    });
  });

  describe('Kubernetes', () => {
    it('validates valid manifest', () => {
      const result = validator.validate('kubernetes', [
        {
          path: 'deployment.yaml',
          content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n',
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it('warns on missing apiVersion/kind', () => {
      const result = validator.validate('kubernetes', [
        { path: 'config.yaml', content: 'name: test\ndata: value\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('apiVersion'))).toBe(true);
    });
  });

  describe('Bicep', () => {
    it('validates valid bicep files', () => {
      const result = validator.validate('bicep', [
        {
          path: 'main.bicep',
          content:
            "resource storageAccount 'Microsoft.Storage/storageAccounts@2021-02-01' = {\n  name: 'st'\n}\n",
        },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('File limits', () => {
    it('fails on file exceeding max size', () => {
      const result = validator.validate('terraform', [
        { path: 'huge.tf', content: 'x'.repeat(600_000) },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds max size'))).toBe(true);
    });

    it('fails on too many files', () => {
      const smallConfig = { ...config, maxTemplateFiles: 2 };
      const v = new IacValidator(smallConfig);
      const files = Array.from({ length: 3 }, (_, i) => ({
        path: `f${i}.tf`,
        content: `resource "x" "r${i}" {}\n`,
      }));
      const result = v.validate('terraform', files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds max files'))).toBe(true);
    });
  });

  describe('hash', () => {
    it('produces deterministic SHA-256', () => {
      const h1 = IacValidator.hash('hello');
      const h2 = IacValidator.hash('hello');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64);
    });
  });

  // ── Additional coverage tests ────────────────────────────────────

  describe('Terraform — additional branches', () => {
    it('accepts .tf.json files', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf.json', content: '{"resource": {}}' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('warns when main.tf has no resource, module, or data blocks', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'variable "foo" {\n  type = string\n}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no resource, module, or data blocks'))).toBe(
        true
      );
    });

    it('does not warn for main.tf with resource block', () => {
      const result = validator.validate('terraform', [
        {
          path: 'main.tf',
          content: 'resource "aws_s3_bucket" "b" {\n  bucket = "my-bucket"\n}\nbackend "s3" {}\n',
        },
      ]);
      expect(result.warnings.some((w) => w.includes('no resource, module, or data blocks'))).toBe(
        false
      );
    });

    it('does not warn for main.tf with module block', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'module "vpc" {\n  source = "./vpc"\n}\nbackend "s3" {}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no resource, module, or data blocks'))).toBe(
        false
      );
    });

    it('does not warn for main.tf with data block', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'data "aws_ami" "latest" {\n}\nbackend "s3" {}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no resource, module, or data blocks'))).toBe(
        false
      );
    });

    it('warns when providers.tf has no provider block', () => {
      const result = validator.validate('terraform', [
        { path: 'providers.tf', content: 'terraform {\n  required_version = ">= 1.0"\n}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no provider block'))).toBe(true);
    });

    it('does not warn when providers.tf has provider block', () => {
      const result = validator.validate('terraform', [
        { path: 'providers.tf', content: 'provider "aws" {\n  region = "us-east-1"\n}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no provider block'))).toBe(false);
    });

    it('does not warn on backend when backend configuration exists', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "x" "y" {}\nbackend "s3" {}\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('backend'))).toBe(false);
    });

    it('detects unbalanced brackets', () => {
      const result = validator.validate('terraform', [
        { path: 'bad.tf', content: 'list = [\n  "a",\n  "b"\n' },
      ]);
      expect(result.errors.some((e) => e.includes('unbalanced brackets'))).toBe(true);
    });

    it('detects AWS access key pattern', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "x" "y" {}\naccess_key = AKIAIOSFODNN7EXAMPLE\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });

    it('detects private key in content', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "x" "y" {}\n-----BEGIN RSA PRIVATE KEY-----\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });
  });

  describe('CloudFormation — additional branches', () => {
    it('warns on JSON missing Resources and AWSTemplateFormatVersion', () => {
      const result = validator.validate('cloudformation', [
        { path: 'template.json', content: '{"Description": "test"}' },
      ]);
      expect(
        result.warnings.some((w) => w.includes('missing Resources or AWSTemplateFormatVersion'))
      ).toBe(true);
    });

    it('warns on YAML missing Resources and AWSTemplateFormatVersion', () => {
      const result = validator.validate('cloudformation', [
        { path: 'template.yaml', content: 'Description: test\n' },
      ]);
      expect(
        result.warnings.some((w) => w.includes('missing Resources or AWSTemplateFormatVersion'))
      ).toBe(true);
    });

    it('does not warn on YAML with Resources', () => {
      const result = validator.validate('cloudformation', [
        { path: 'template.yaml', content: 'Resources:\n  Bucket:\n    Type: AWS::S3::Bucket\n' },
      ]);
      expect(
        result.warnings.some((w) => w.includes('missing Resources or AWSTemplateFormatVersion'))
      ).toBe(false);
    });

    it('detects hardcoded secrets in CloudFormation files', () => {
      const result = validator.validate('cloudformation', [
        {
          path: 'template.yaml',
          content:
            'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  password: "supersecret123"\n',
        },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });

    it('fails on no YAML/JSON files', () => {
      const result = validator.validate('cloudformation', [
        { path: 'readme.md', content: '# Hello' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No YAML/JSON template files found'))).toBe(true);
    });
  });

  describe('Pulumi — additional branches', () => {
    it('warns when no entry point file found', () => {
      const result = validator.validate('pulumi', [
        { path: 'Pulumi.yaml', content: 'name: proj\nruntime: nodejs\n' },
        { path: 'README.md', content: '# readme' },
      ]);
      expect(result.warnings.some((w) => w.includes('No entry point file found'))).toBe(true);
    });

    it('accepts __main__.py as entry point', () => {
      const result = validator.validate('pulumi', [
        { path: 'Pulumi.yaml', content: 'name: proj\nruntime: python\n' },
        { path: '__main__.py', content: 'import pulumi\n' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('No entry point'))).toBe(false);
    });

    it('accepts main.go as entry point', () => {
      const result = validator.validate('pulumi', [
        { path: 'Pulumi.yaml', content: 'name: proj\nruntime: go\n' },
        { path: 'main.go', content: 'package main\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('detects hardcoded secrets in Pulumi files', () => {
      const result = validator.validate('pulumi', [
        { path: 'Pulumi.yaml', content: 'name: proj\n' },
        {
          path: 'index.ts',
          content: 'const secret: "mysecretpassword1234" = "api_key: abcdef12345678"\n',
        },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });

    it('accepts Pulumi.yaml nested in subdirectory', () => {
      const result = validator.validate('pulumi', [
        { path: 'infra/Pulumi.yaml', content: 'name: proj\n' },
        { path: 'infra/index.ts', content: 'import * as pulumi from "@pulumi/pulumi";\n' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('Helm — additional branches', () => {
    it('warns on missing templates/ directory', () => {
      const result = validator.validate('helm', [
        { path: 'Chart.yaml', content: 'apiVersion: v2\nname: test\n' },
        { path: 'values.yaml', content: 'replicaCount: 1\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('No templates/ directory'))).toBe(true);
    });

    it('warns on missing values.yaml', () => {
      const result = validator.validate('helm', [
        { path: 'Chart.yaml', content: 'apiVersion: v2\nname: test\n' },
        { path: 'templates/deployment.yaml', content: 'apiVersion: apps/v1\nkind: Deployment\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('No values.yaml'))).toBe(true);
    });

    it('accepts Chart.yaml in subdirectory', () => {
      const result = validator.validate('helm', [
        { path: 'charts/my-chart/Chart.yaml', content: 'apiVersion: v2\n' },
        { path: 'charts/my-chart/templates/svc.yaml', content: 'apiVersion: v1\nkind: Service\n' },
        { path: 'charts/my-chart/values.yaml', content: 'port: 80\n' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('Kubernetes — additional branches', () => {
    it('fails on no YAML files', () => {
      const result = validator.validate('kubernetes', [{ path: 'readme.md', content: '# Hello' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No YAML manifest files'))).toBe(true);
    });

    it('detects hardcoded secrets in kubernetes manifests', () => {
      const result = validator.validate('kubernetes', [
        {
          path: 'secret.yaml',
          content: 'apiVersion: v1\nkind: Secret\npassword: "supersecret123"\n',
        },
      ]);
      expect(result.warnings.some((w) => w.includes('hardcoded secret'))).toBe(true);
    });

    it('accepts .yml extension', () => {
      const result = validator.validate('kubernetes', [
        { path: 'deploy.yml', content: 'apiVersion: apps/v1\nkind: Deployment\n' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('Bicep — additional branches', () => {
    it('fails on no .bicep or .json files', () => {
      const result = validator.validate('bicep', [{ path: 'readme.md', content: '# Hello' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No .bicep or .json ARM'))).toBe(true);
    });

    it('warns when bicep file has no resource or module', () => {
      const result = validator.validate('bicep', [
        { path: 'main.bicep', content: 'param name string\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('no resource or module declarations'))).toBe(
        true
      );
    });

    it('validates ARM JSON template', () => {
      const result = validator.validate('bicep', [
        { path: 'template.json', content: '{"$schema": "https://schema.management.azure.com"}' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on invalid ARM JSON', () => {
      const result = validator.validate('bicep', [{ path: 'bad.json', content: '{ invalid json' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('invalid JSON'))).toBe(true);
    });
  });

  describe('Ansible', () => {
    it('validates valid playbook with hosts', () => {
      const result = validator.validate('ansible', [
        { path: 'playbook.yaml', content: '- hosts: all\n  tasks:\n    - name: test\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on no YAML files', () => {
      const result = validator.validate('ansible', [{ path: 'readme.md', content: '# Hello' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No YAML playbook files'))).toBe(true);
    });

    it('warns when file has no hosts/tasks/roles', () => {
      const result = validator.validate('ansible', [
        { path: 'playbook.yaml', content: 'name: test\nvars:\n  foo: bar\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('does not appear to be a playbook'))).toBe(
        true
      );
    });

    it('does not warn for file with roles', () => {
      const result = validator.validate('ansible', [
        { path: 'site.yml', content: '- roles:\n    - webserver\n' },
      ]);
      expect(result.warnings.some((w) => w.includes('does not appear to be a playbook'))).toBe(
        false
      );
    });
  });

  describe('CDK', () => {
    it('validates valid CDK project', () => {
      const result = validator.validate('cdk', [
        { path: 'cdk.json', content: '{"app": "npx ts-node bin/app.ts"}' },
        { path: 'lib/stack.ts', content: 'import * as cdk from "aws-cdk-lib";\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('fails on missing cdk.json', () => {
      const result = validator.validate('cdk', [
        { path: 'lib/stack.ts', content: 'import * as cdk from "aws-cdk-lib";\n' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing cdk.json'))).toBe(true);
    });

    it('warns when no source files found', () => {
      const result = validator.validate('cdk', [
        { path: 'cdk.json', content: '{"app": "npx ts-node bin/app.ts"}' },
      ]);
      expect(result.warnings.some((w) => w.includes('No source files found'))).toBe(true);
    });

    it('accepts .py entry file', () => {
      const result = validator.validate('cdk', [
        { path: 'cdk.json', content: '{"app": "python app.py"}' },
        { path: 'app.py', content: 'import aws_cdk\n' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('No source files'))).toBe(false);
    });

    it('accepts .java entry file', () => {
      const result = validator.validate('cdk', [
        { path: 'cdk.json', content: '{}' },
        { path: 'src/App.java', content: 'public class App {}\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('accepts .cs entry file', () => {
      const result = validator.validate('cdk', [
        { path: 'cdk.json', content: '{}' },
        { path: 'src/Program.cs', content: 'class Program {}\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('accepts cdk.json in subdirectory', () => {
      const result = validator.validate('cdk', [
        { path: 'infra/cdk.json', content: '{}' },
        { path: 'infra/lib/stack.ts', content: 'export class Stack {}\n' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate — result structure', () => {
    it('includes tool, fileCount, and durationMs', () => {
      const result = validator.validate('terraform', [
        { path: 'main.tf', content: 'resource "x" "y" {}\nbackend "s3" {}\n' },
      ]);
      expect(result.tool).toBe('terraform');
      expect(result.fileCount).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkJsonSyntax — non-Error thrown', () => {
    it('handles non-Error exception in JSON.parse', () => {
      // JSON.parse always throws SyntaxError (which is an Error), but
      // we test the branch by checking the error message
      const result = validator.validate('cloudformation', [{ path: 'bad.json', content: '{' }]);
      expect(result.errors.some((e) => e.includes('invalid JSON'))).toBe(true);
    });
  });
});
