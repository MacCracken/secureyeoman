// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SwarmTemplatesTab } from './SwarmTemplatesTab';

vi.mock('../../api/client', () => ({
  fetchCommunitySwarmTemplates: vi.fn(),
  exportSwarmTemplate: vi.fn(),
  importSwarmTemplate: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchCommunitySwarmTemplates = vi.mocked(api.fetchCommunitySwarmTemplates);
const mockExportSwarmTemplate = vi.mocked(api.exportSwarmTemplate);
const mockImportSwarmTemplate = vi.mocked(api.importSwarmTemplate);

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'Security Audit Team',
  description: 'A sequential security audit swarm',
  strategy: 'sequential' as const,
  roles: [
    { role: 'researcher', profileName: 'security-researcher', description: 'Researches' },
    { role: 'hacker', profileName: 'ethical-whitehat-hacker', description: 'Probes' },
    { role: 'writer', profileName: 'technical-writer', description: 'Documents' },
  ],
  coordinatorProfile: null,
  isBuiltin: false,
  createdAt: 1000,
};

const EXPORT_PAYLOAD = {
  exportedAt: Date.now(),
  requires: { profileRoles: ['security-researcher', 'ethical-whitehat-hacker', 'technical-writer'] },
  template: TEMPLATE,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab(source?: string) {
  return render(
    <QueryClientProvider client={createQC()}>
      <SwarmTemplatesTab source={source} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [TEMPLATE], total: 1 });
  mockExportSwarmTemplate.mockResolvedValue(EXPORT_PAYLOAD);
  mockImportSwarmTemplate.mockResolvedValue({
    template: TEMPLATE,
    compatibility: { compatible: false, gaps: { profileRoles: ['security-researcher'] } },
  });
});

describe('SwarmTemplatesTab', () => {
  it('renders template cards when data is available', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Security Audit Team')).toBeDefined();
    });
  });

  it('shows description', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('A sequential security audit swarm')).toBeDefined();
    });
  });

  it('shows strategy badge', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('sequential')).toBeDefined();
    });
  });

  it('shows role pills', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('researcher')).toBeDefined();
      expect(screen.getByText('hacker')).toBeDefined();
      expect(screen.getByText('writer')).toBeDefined();
    });
  });

  it('shows empty state when no templates (community)', async () => {
    mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [], total: 0 });
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('No community swarm templates available')).toBeDefined();
    });
  });

  it('renders Export and Install buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
      expect(screen.getByTitle('Install swarm template')).toBeDefined();
    });
  });
});
