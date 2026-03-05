#!/usr/bin/env tsx
/**
 * generate-openapi.ts — Auto-generate OpenAPI 3.1 spec from route source files.
 *
 * Scans all *-routes.ts files for Fastify route registrations (app.get, app.post, etc.)
 * and emits a valid OpenAPI 3.1 YAML spec at docs/api/openapi.yaml.
 *
 * Usage:
 *   npx tsx scripts/generate-openapi.ts
 *   npx tsx scripts/generate-openapi.ts --json   # output JSON instead of YAML
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

// ── Config ───────────────────────────────────────────────────────────────────

const CORE_SRC = join(import.meta.dirname ?? '.', '..', 'packages', 'core', 'src');
const OUTPUT_YAML = join(import.meta.dirname ?? '.', '..', 'docs', 'api', 'openapi.yaml');
const OUTPUT_JSON = join(import.meta.dirname ?? '.', '..', 'docs', 'api', 'openapi.json');

// ── Route extraction ─────────────────────────────────────────────────────────

interface RouteEntry {
  method: string;
  path: string;
  file: string;
  tag: string;
}

/** Recursively find all *-routes.ts files. */
function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name.endsWith('-routes.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

// Matches: app.get('/api/v1/...', ...) | app.post('/api/v1/...', ...) etc.
// Also matches route method calls with options objects.
const ROUTE_REGEX = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;

/** Derive a tag from the route file path (e.g. brain/brain-routes.ts → Brain). */
function deriveTag(filePath: string): string {
  const rel = relative(CORE_SRC, filePath);
  // Use the directory or the filename stem
  const parts = rel.replace(/\\/g, '/').split('/');
  if (parts.length > 1) {
    return capitalize(parts[0]!);
  }
  return capitalize(basename(filePath).replace(/-routes\.ts$/, ''));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractRoutes(filePath: string): RouteEntry[] {
  const content = readFileSync(filePath, 'utf8');
  const tag = deriveTag(filePath);
  const routes: RouteEntry[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  ROUTE_REGEX.lastIndex = 0;
  while ((match = ROUTE_REGEX.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const path = match[2]!;
    routes.push({
      method,
      path,
      file: relative(join(CORE_SRC, '..', '..', '..'), filePath),
      tag,
    });
  }
  return routes;
}

// ── OpenAPI spec generation ──────────────────────────────────────────────────

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, unknown>>;
}

/** Convert Fastify :param syntax to OpenAPI {param} syntax. */
function toOpenAPIPath(fastifyPath: string): string {
  return fastifyPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/** Extract path parameters from a Fastify-style path. */
function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]!);
  }
  return params;
}

function buildSpec(routes: RouteEntry[]): OpenAPISpec {
  // Collect unique tags
  const tagSet = new Set<string>();
  for (const r of routes) tagSet.add(r.tag);
  const tags = [...tagSet].sort().map((t) => ({ name: t, description: `${t} endpoints` }));

  // Group routes by path
  const paths: Record<string, Record<string, unknown>> = {};

  // Sort routes for deterministic output
  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  for (const route of sorted) {
    const oaPath = toOpenAPIPath(route.path);
    if (!paths[oaPath]) paths[oaPath] = {};

    const method = route.method.toLowerCase();
    const pathParams = extractPathParams(route.path);
    const operationId = `${method}_${route.path
      .replace(/^\/api\/v1\//, '')
      .replace(/[/:]/g, '_')
      .replace(/[{}]/g, '')
      .replace(/_+/g, '_')
      .replace(/_$/, '')}`;

    const operation: Record<string, unknown> = {
      tags: [route.tag],
      operationId,
      summary: `${route.method} ${route.path}`,
      responses: {
        '200': { description: 'Successful response' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden' },
      },
    };

    if (pathParams.length > 0) {
      operation.parameters = pathParams.map((p) => ({
        name: p,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
    }

    if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
      operation.requestBody = {
        content: { 'application/json': { schema: { type: 'object' } } },
      };
      (operation.responses as Record<string, unknown>)['400'] = {
        description: 'Bad request',
      };
    }

    if (route.method === 'DELETE') {
      (operation.responses as Record<string, unknown>)['404'] = {
        description: 'Not found',
      };
    }

    paths[oaPath]![method] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'SecureYeoman API',
      version: '1.0.0',
      description:
        'Auto-generated OpenAPI specification for the SecureYeoman REST API. ' +
        'Generated from route source files — schemas are placeholder objects. ' +
        'See docs/api/rest-api.md for detailed request/response examples.',
    },
    servers: [{ url: 'http://localhost:4100', description: 'Local development' }],
    tags,
    paths,
  };
}

// ── YAML serialization (minimal, no dependency) ──────────────────────────────

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    // Quote strings that could be misinterpreted
    if (
      obj === '' ||
      obj === 'true' ||
      obj === 'false' ||
      obj === 'null' ||
      /^[\d]/.test(obj) ||
      /[:#{}[\],&*?|>!%@`]/.test(obj) ||
      obj.includes('\n')
    ) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => {
      const val = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        return `${pad}- ${val.trimStart()}`;
      }
      return `${pad}- ${val}`;
    }).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([key, val]) => {
      const yamlVal = toYaml(val, indent + 1);
      if (typeof val === 'object' && val !== null && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)) {
        return `${pad}${key}:\n${yamlVal}`;
      }
      return `${pad}${key}: ${yamlVal}`;
    }).join('\n');
  }

  return String(obj);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes('--json');

const routeFiles = findRouteFiles(CORE_SRC);
const allRoutes: RouteEntry[] = [];

for (const file of routeFiles) {
  allRoutes.push(...extractRoutes(file));
}

// Deduplicate (some routes may be registered conditionally in multiple places)
const seen = new Set<string>();
const uniqueRoutes = allRoutes.filter((r) => {
  const key = `${r.method}:${r.path}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const spec = buildSpec(uniqueRoutes);

if (outputJson) {
  writeFileSync(OUTPUT_JSON, JSON.stringify(spec, null, 2) + '\n');
  console.log(`\nOpenAPI 3.1 spec written to: ${OUTPUT_JSON}`);
} else {
  writeFileSync(OUTPUT_YAML, toYaml(spec) + '\n');
  console.log(`\nOpenAPI 3.1 spec written to: ${OUTPUT_YAML}`);
}

console.log(`  Route files scanned: ${routeFiles.length}`);
console.log(`  Endpoints found:     ${uniqueRoutes.length}`);
console.log(`  Tags:                ${new Set(uniqueRoutes.map((r) => r.tag)).size}`);
console.log('');
