// @vitest-environment jsdom
/**
 * WorkflowVersionHistory Tests — Phase 114
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  fetchWorkflowVersions: vi.fn(),
  fetchWorkflowDrift: vi.fn(),
  tagWorkflowRelease: vi.fn(),
  rollbackWorkflow: vi.fn(),
  fetchWorkflowVersionDiff: vi.fn(),
}));

import * as api from '../../api/client';
import WorkflowVersionHistory from './WorkflowVersionHistory';

const mockFetchVersions = vi.mocked(api.fetchWorkflowVersions);
const mockFetchDrift = vi.mocked(api.fetchWorkflowDrift);
const mockTagRelease = vi.mocked(api.tagWorkflowRelease);
const mockFetchDiff = vi.mocked(api.fetchWorkflowVersionDiff);

const VERSION = {
  id: 'wv-1',
  workflowId: 'wf-1',
  versionTag: '2026.3.2',
  snapshot: { name: 'Test Workflow' },
  diffSummary: null,
  changedFields: ['steps'],
  author: 'system',
  createdAt: 1700000000000,
};

const DRIFT = {
  lastTaggedVersion: '2026.3.2',
  lastTaggedAt: 1700000000000,
  uncommittedChanges: 2,
  changedFields: ['steps', 'edges'],
  diffSummary: '--- tagged\n+++ current',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchVersions.mockResolvedValue({ versions: [VERSION], total: 1 });
  mockFetchDrift.mockResolvedValue(DRIFT);
});

describe('WorkflowVersionHistory', () => {
  it('renders version list after loading', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    expect(screen.getAllByText('2026.3.2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows drift badge with uncommitted changes', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('2 uncommitted changes')).toBeInTheDocument();
    });
  });

  it('calls tagRelease when Tag Release button clicked', async () => {
    mockTagRelease.mockResolvedValue({});
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag Release'));
    await waitFor(() => {
      expect(mockTagRelease).toHaveBeenCalledWith('wf-1');
    });
  });

  it('shows snapshot preview when version is clicked', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    const tags = screen.getAllByText('2026.3.2');
    const versionTag = tags.find(el => el.closest('div[class*="cursor-pointer"]'));
    fireEvent.click(versionTag!.closest('div[class*="cursor-pointer"]')!);
    await waitFor(() => {
      expect(screen.getByText(/Snapshot:/)).toBeInTheDocument();
    });
  });

  it('shows error message on load failure', async () => {
    mockFetchVersions.mockRejectedValue(new Error('Server error'));
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    mockFetchVersions.mockReturnValue(new Promise(() => {}));
    mockFetchDrift.mockReturnValue(new Promise(() => {}));
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    expect(screen.getByText('Loading version history...')).toBeInTheDocument();
  });
});
