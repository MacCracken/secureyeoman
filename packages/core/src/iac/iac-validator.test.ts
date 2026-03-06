/**
 * IaC Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { IacValidator } from './iac-validator.js';
import type { IacConfig } from '@secureyeoman/shared';

const config: IacConfig = {
  enabled: true,
  repo: { repoPath: '', remoteUrl: '', branch: 'main', templateDir: 'templates', syncIntervalSec: 0 },
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
      const result = validator.validate('terraform', [
        { path: 'readme.md', content: '# Hello' },
      ]);
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
        { path: 'template.yaml', content: 'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  Bucket:\n    Type: AWS::S3::Bucket\n' },
      ]);
      expect(result.valid).toBe(true);
    });

    it('validates valid JSON template', () => {
      const result = validator.validate('cloudformation', [
        { path: 'template.json', content: '{"AWSTemplateFormatVersion": "2010-09-09", "Resources": {}}' },
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
        { path: 'template.yaml', content: "AWSTemplateFormatVersion: '2010-09-09'\nResources:\n\tBucket:\n\t\tType: AWS::S3::Bucket\n" },
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
        { path: 'deployment.yaml', content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n' },
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
        { path: 'main.bicep', content: 'resource storageAccount \'Microsoft.Storage/storageAccounts@2021-02-01\' = {\n  name: \'st\'\n}\n' },
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
});
