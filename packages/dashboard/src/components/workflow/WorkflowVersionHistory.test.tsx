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
    mockTagRelease.mockResolvedValue(VERSION as any);
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
    const versionTag = tags.find((el) => el.closest('div[class*="cursor-pointer"]'));
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

  it('shows "No tagged releases yet" when no tags exist', async () => {
    mockFetchDrift.mockResolvedValue({
      lastTaggedVersion: null,
      lastTaggedAt: null,
      uncommittedChanges: 0,
      changedFields: [],
      diffSummary: '',
    });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('No tagged releases yet')).toBeInTheDocument();
    });
  });

  it('shows Tag First Release button when no tags exist', async () => {
    mockFetchDrift.mockResolvedValue({
      lastTaggedVersion: null,
      lastTaggedAt: null,
      uncommittedChanges: 0,
      changedFields: [],
      diffSummary: '',
    });
    const mockTag = vi.mocked(api.tagWorkflowRelease);
    mockTag.mockResolvedValue({} as any);
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag First Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag First Release'));
    await waitFor(() => {
      expect(mockTag).toHaveBeenCalledWith('wf-1');
    });
  });

  it('shows up-to-date badge when no drift', async () => {
    mockFetchDrift.mockResolvedValue({
      ...DRIFT,
      uncommittedChanges: 0,
      changedFields: [],
    });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('up to date')).toBeInTheDocument();
    });
  });

  it('shows empty state when no versions', async () => {
    mockFetchVersions.mockResolvedValue({ versions: [], total: 0 });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('No versions recorded yet.')).toBeInTheDocument();
    });
  });

  it('shows changedFields in version row', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('[steps]')).toBeInTheDocument();
    });
  });

  it('shows author in version row', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('system')).toBeInTheDocument();
    });
  });

  it('handles rollback with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mockRollback = vi.mocked(api.rollbackWorkflow);
    mockRollback.mockResolvedValue({} as any);
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('rollback')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('rollback'));
    await waitFor(() => {
      expect(mockRollback).toHaveBeenCalledWith('wf-1', 'wv-1');
    });
    vi.restoreAllMocks();
  });

  it('does not rollback when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const mockRollback = vi.mocked(api.rollbackWorkflow);
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('rollback')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('rollback'));
    expect(mockRollback).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('shows error when rollback fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mockRollback = vi.mocked(api.rollbackWorkflow);
    mockRollback.mockRejectedValue(new Error('Rollback denied'));
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('rollback')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('rollback'));
    await waitFor(() => {
      expect(screen.getByText('Rollback denied')).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });

  it('shows error when tag release fails', async () => {
    mockTagRelease.mockRejectedValue(new Error('Tag error'));
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag Release'));
    await waitFor(() => {
      expect(screen.getByText('Tag error')).toBeInTheDocument();
    });
  });

  it('shows diff when diff button is clicked with two versions', async () => {
    const VERSION2 = { ...VERSION, id: 'wv-2', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockResolvedValue({ diff: '+new line\n-old line\n@@ hunk @@' });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('diff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('diff'));
    await waitFor(() => {
      expect(mockFetchDiff).toHaveBeenCalledWith('wf-1', 'wv-1', 'wv-2');
    });
    await waitFor(() => {
      expect(screen.getByText(/Diff:/)).toBeInTheDocument();
    });
  });

  it('closes diff viewer when Close is clicked', async () => {
    const VERSION2 = { ...VERSION, id: 'wv-2', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockResolvedValue({ diff: '+line' });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('diff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('diff'));
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText(/Diff:/)).not.toBeInTheDocument();
    });
  });

  it('shows error when diff fails', async () => {
    const VERSION2 = { ...VERSION, id: 'wv-2', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockRejectedValue(new Error('Diff unavailable'));
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('diff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('diff'));
    await waitFor(() => {
      expect(screen.getByText('Diff unavailable')).toBeInTheDocument();
    });
  });

  it('toggles version preview off when clicked again', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    const tags = screen.getAllByText('2026.3.2');
    const versionRow = tags.find((el) => el.closest('div[class*="cursor-pointer"]'))!
      .closest('div[class*="cursor-pointer"]')!;
    fireEvent.click(versionRow);
    await waitFor(() => {
      expect(screen.getByText(/Snapshot:/)).toBeInTheDocument();
    });
    fireEvent.click(versionRow);
    await waitFor(() => {
      expect(screen.queryByText(/Snapshot:/)).not.toBeInTheDocument();
    });
  });

  it('shows "untagged" for versions without a tag', async () => {
    const UNTAGGED = { ...VERSION, id: 'wv-u', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [UNTAGGED], total: 1 });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('untagged')).toBeInTheDocument();
    });
  });

  it('shows plural "changes" for multiple uncommitted', async () => {
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('2 uncommitted changes')).toBeInTheDocument();
    });
  });

  it('shows singular "change" for one uncommitted', async () => {
    mockFetchDrift.mockResolvedValue({ ...DRIFT, uncommittedChanges: 1 });
    render(<WorkflowVersionHistory workflowId="wf-1" />);
    await waitFor(() => {
      expect(screen.getByText('1 uncommitted change')).toBeInTheDocument();
    });
  });
});
