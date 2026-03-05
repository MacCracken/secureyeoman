/**
 * Excalidraw Element Templates (Phase 117)
 *
 * Pre-built diagram element templates and color palettes for common
 * architecture and infrastructure components.
 */

import type { ExcalidrawElementSpec } from '@secureyeoman/shared';

// ─── Color Palettes ─────────────────────────────────────────────────────────

export interface ColorPalette {
  name: string;
  stroke: string;
  background: string;
  fill: string;
  text: string;
  accent: string;
}

const PALETTES: Record<string, ColorPalette> = {
  default: {
    name: 'Default',
    stroke: '#1e1e1e',
    background: '#a5d8ff',
    fill: '#a5d8ff',
    text: '#1e1e1e',
    accent: '#1971c2',
  },
  dark: {
    name: 'Dark',
    stroke: '#e9ecef',
    background: '#343a40',
    fill: '#495057',
    text: '#f8f9fa',
    accent: '#748ffc',
  },
  monochrome: {
    name: 'Monochrome',
    stroke: '#000000',
    background: '#e9ecef',
    fill: '#dee2e6',
    text: '#000000',
    accent: '#495057',
  },
  warm: {
    name: 'Warm',
    stroke: '#5c3d2e',
    background: '#ffd8a8',
    fill: '#ffe8cc',
    text: '#5c3d2e',
    accent: '#e8590c',
  },
  cool: {
    name: 'Cool',
    stroke: '#1b3a4b',
    background: '#d0ebff',
    fill: '#e7f5ff',
    text: '#1b3a4b',
    accent: '#1864ab',
  },
};

export function getPalette(name: string): ColorPalette | undefined {
  return PALETTES[name];
}

export function getAllPalettes(): Record<string, ColorPalette> {
  return { ...PALETTES };
}

// ─── Template Functions ─────────────────────────────────────────────────────
// Each returns ExcalidrawElementSpec[] positioned relative to (0,0).
// The caller applies an anchor offset (x,y) when placing templates.

function database(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'ellipse',
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      label: 'Database',
      backgroundColor: '#d0bfff',
      fillStyle: 'solid',
      groupId: 'db',
    },
    {
      type: 'rectangle',
      x: 0,
      y: 20,
      width: 120,
      height: 60,
      backgroundColor: '#d0bfff',
      fillStyle: 'solid',
      groupId: 'db',
    },
    {
      type: 'ellipse',
      x: 0,
      y: 60,
      width: 120,
      height: 40,
      backgroundColor: '#d0bfff',
      fillStyle: 'solid',
      groupId: 'db',
    },
  ];
}

function server(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      label: 'Server',
      backgroundColor: '#a5d8ff',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function cloud(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'ellipse',
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      label: 'Cloud',
      backgroundColor: '#e7f5ff',
      fillStyle: 'solid',
    },
  ];
}

function user(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'ellipse',
      x: 20,
      y: 0,
      width: 40,
      height: 40,
      backgroundColor: '#ffd8a8',
      fillStyle: 'solid',
      groupId: 'user',
    },
    {
      type: 'rectangle',
      x: 0,
      y: 45,
      width: 80,
      height: 50,
      label: 'User',
      backgroundColor: '#ffd8a8',
      fillStyle: 'solid',
      roundness: { type: 3 },
      groupId: 'user',
    },
  ];
}

function loadBalancer(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'diamond',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      label: 'LB',
      backgroundColor: '#b2f2bb',
      fillStyle: 'solid',
    },
  ];
}

function queue(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 140,
      height: 60,
      label: 'Message Queue',
      backgroundColor: '#ffec99',
      fillStyle: 'hachure',
      roundness: { type: 3 },
    },
  ];
}

function container(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 200,
      height: 140,
      label: 'Container',
      backgroundColor: '#e9ecef',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function lock(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      label: 'Auth',
      backgroundColor: '#ffc9c9',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function apiGateway(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 140,
      height: 70,
      label: 'API Gateway',
      backgroundColor: '#99e9f2',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function network(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      label: 'Network',
      backgroundColor: '#f8f9fa',
      fillStyle: 'solid',
      strokeWidth: 2,
      roundness: { type: 3 },
    },
  ];
}

function monitor(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      label: 'Monitoring',
      backgroundColor: '#d3f9d8',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function storage(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 70,
      label: 'Storage',
      backgroundColor: '#e5dbff',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function cache(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'diamond',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      label: 'Cache',
      backgroundColor: '#c3fae8',
      fillStyle: 'solid',
    },
  ];
}

function func(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      label: 'Function',
      backgroundColor: '#fcc2d7',
      fillStyle: 'solid',
      roundness: { type: 3 },
    },
  ];
}

function mobile(): ExcalidrawElementSpec[] {
  return [
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 60,
      height: 100,
      label: 'Mobile',
      backgroundColor: '#dee2e6',
      fillStyle: 'solid',
      roundness: { type: 3, value: 16 },
    },
  ];
}

// ─── Template Registry ──────────────────────────────────────────────────────

interface TemplateEntry {
  name: string;
  description: string;
  category: string;
  build: () => ExcalidrawElementSpec[];
}

const TEMPLATES: TemplateEntry[] = [
  {
    name: 'database',
    description: 'Database cylinder (ellipse + rect)',
    category: 'data',
    build: database,
  },
  {
    name: 'storage',
    description: 'Generic storage block',
    category: 'data',
    build: storage,
  },
  {
    name: 'cache',
    description: 'Cache diamond',
    category: 'data',
    build: cache,
  },
  {
    name: 'server',
    description: 'Server rectangle',
    category: 'compute',
    build: server,
  },
  {
    name: 'function',
    description: 'Serverless function block',
    category: 'compute',
    build: func,
  },
  {
    name: 'container',
    description: 'Container / boundary region',
    category: 'compute',
    build: container,
  },
  {
    name: 'cloud',
    description: 'Cloud provider ellipse',
    category: 'infrastructure',
    build: cloud,
  },
  {
    name: 'network',
    description: 'Network boundary rectangle',
    category: 'infrastructure',
    build: network,
  },
  {
    name: 'loadBalancer',
    description: 'Load balancer diamond',
    category: 'infrastructure',
    build: loadBalancer,
  },
  {
    name: 'apiGateway',
    description: 'API gateway rectangle',
    category: 'infrastructure',
    build: apiGateway,
  },
  {
    name: 'queue',
    description: 'Message queue rectangle',
    category: 'messaging',
    build: queue,
  },
  {
    name: 'user',
    description: 'User actor (head + body)',
    category: 'actors',
    build: user,
  },
  {
    name: 'mobile',
    description: 'Mobile device rectangle',
    category: 'actors',
    build: mobile,
  },
  {
    name: 'lock',
    description: 'Authentication / security block',
    category: 'security',
    build: lock,
  },
  {
    name: 'monitor',
    description: 'Monitoring / observability block',
    category: 'security',
    build: monitor,
  },
];

export function getTemplateCategories(): string[] {
  const cats = new Set(TEMPLATES.map((t) => t.category));
  return [...cats].sort();
}

export function getTemplatesByCategory(
  category?: string
): { name: string; description: string; category: string }[] {
  const filtered = category ? TEMPLATES.filter((t) => t.category === category) : TEMPLATES;
  return filtered.map(({ name, description, category: cat }) => ({
    name,
    description,
    category: cat,
  }));
}

export function getTemplate(
  name: string,
  anchorX = 0,
  anchorY = 0
): ExcalidrawElementSpec[] | undefined {
  const entry = TEMPLATES.find((t) => t.name === name);
  if (!entry) return undefined;
  const specs = entry.build();
  // Offset to anchor position
  return specs.map((s) => ({ ...s, x: s.x + anchorX, y: s.y + anchorY }));
}
