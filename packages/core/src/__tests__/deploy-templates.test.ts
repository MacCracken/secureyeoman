import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '../../../../');

/* ── Helpers ── */

function readJson(relPath: string): unknown {
  const abs = resolve(ROOT, relPath);
  expect(existsSync(abs), `${relPath} should exist`).toBe(true);
  const raw = readFileSync(abs, 'utf-8');
  return JSON.parse(raw);
}

function readYaml(relPath: string): unknown {
  const abs = resolve(ROOT, relPath);
  expect(existsSync(abs), `${relPath} should exist`).toBe(true);
  const raw = readFileSync(abs, 'utf-8');
  return parseYaml(raw);
}

/* ── railway.json ── */

describe('railway.json', () => {
  const railway = readJson('railway.json') as Record<string, unknown>;

  it('exists and is valid JSON', () => {
    expect(railway).toBeDefined();
    expect(typeof railway).toBe('object');
  });

  it('has a deploy section with healthcheckPath', () => {
    const deploy = railway.deploy as Record<string, unknown>;
    expect(deploy).toBeDefined();
    expect(deploy.healthcheckPath).toBe('/health');
  });

  it('references port 18789', () => {
    const raw = JSON.stringify(railway);
    expect(raw).toContain('18789');
  });

  it('has SECUREYEOMAN_ADMIN_PASSWORD in variables', () => {
    const raw = JSON.stringify(railway);
    expect(raw).toContain('SECUREYEOMAN_ADMIN_PASSWORD');
  });

  it('defines persistent volumes', () => {
    const services = railway.services as Array<Record<string, unknown>>;
    expect(services).toBeDefined();
    const first = services[0];
    const volumes = first.volumes as Array<Record<string, unknown>>;
    expect(volumes.length).toBeGreaterThanOrEqual(1);
    const mounts = volumes.map((v) => v.mount);
    expect(mounts).toContain('/var/lib/postgresql/data');
  });
});

/* ── render.yaml ── */

describe('render.yaml', () => {
  const render = readYaml('render.yaml') as Record<string, unknown>;

  it('exists and is valid YAML', () => {
    expect(render).toBeDefined();
    expect(typeof render).toBe('object');
  });

  it('has a services section', () => {
    const services = render.services as unknown[];
    expect(services).toBeDefined();
    expect(services.length).toBeGreaterThanOrEqual(1);
  });

  it('has a databases section', () => {
    const databases = render.databases as unknown[];
    expect(databases).toBeDefined();
    expect(databases.length).toBeGreaterThanOrEqual(1);
  });

  it('references port 18789', () => {
    const raw = JSON.stringify(render);
    expect(raw).toContain('18789');
  });

  it('has healthCheckPath set to /health', () => {
    const services = render.services as Array<Record<string, unknown>>;
    expect(services[0].healthCheckPath).toBe('/health');
  });

  it('has SECUREYEOMAN_ADMIN_PASSWORD in envVars', () => {
    const raw = JSON.stringify(render);
    expect(raw).toContain('SECUREYEOMAN_ADMIN_PASSWORD');
  });

  it('wires database connection from the database addon', () => {
    const services = render.services as Array<Record<string, unknown>>;
    const envVars = services[0].envVars as Array<Record<string, unknown>>;
    const dbHostVar = envVars.find((e) => e.key === 'DATABASE_HOST');
    expect(dbHostVar).toBeDefined();
    expect(dbHostVar!.fromDatabase).toBeDefined();
  });
});

/* ── digitalocean-app.json ── */

describe('digitalocean-app.json', () => {
  const doApp = readJson('digitalocean-app.json') as Record<string, unknown>;
  const spec = doApp.spec as Record<string, unknown>;

  it('exists and is valid JSON', () => {
    expect(doApp).toBeDefined();
    expect(spec).toBeDefined();
  });

  it('has a services section', () => {
    const services = spec.services as unknown[];
    expect(services).toBeDefined();
    expect(services.length).toBeGreaterThanOrEqual(1);
  });

  it('has a databases section', () => {
    const databases = spec.databases as unknown[];
    expect(databases).toBeDefined();
    expect(databases.length).toBeGreaterThanOrEqual(1);
  });

  it('references port 18789', () => {
    const raw = JSON.stringify(doApp);
    expect(raw).toContain('18789');
  });

  it('has health check on /health', () => {
    const services = spec.services as Array<Record<string, unknown>>;
    const healthCheck = services[0].health_check as Record<string, unknown>;
    expect(healthCheck).toBeDefined();
    expect(healthCheck.http_path).toBe('/health');
  });

  it('has SECUREYEOMAN_ADMIN_PASSWORD in envs', () => {
    const raw = JSON.stringify(doApp);
    expect(raw).toContain('SECUREYEOMAN_ADMIN_PASSWORD');
  });

  it('wires database variables from the database component', () => {
    const services = spec.services as Array<Record<string, unknown>>;
    const envs = services[0].envs as Array<Record<string, unknown>>;
    const dbHostVar = envs.find((e) => e.key === 'DATABASE_HOST');
    expect(dbHostVar).toBeDefined();
    expect(String(dbHostVar!.value)).toContain('secureyeoman-db');
  });
});
