// @vitest-environment jsdom
/**
 * PersonalityVersionHistory Tests — Phase 114
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchPersonalityVersions: vi.fn(),
    fetchPersonalityDrift: vi.fn(),
    tagPersonalityRelease: vi.fn(),
    rollbackPersonality: vi.fn(),
    deletePersonalityTag: vi.fn(),
    fetchPersonalityVersionDiff: vi.fn(),
  };
});

import * as api from '../../api/client';
import PersonalityVersionHistory from './PersonalityVersionHistory';

const mockFetchVersions = vi.mocked(api.fetchPersonalityVersions);
const mockFetchDrift = vi.mocked(api.fetchPersonalityDrift);
const mockTagRelease = vi.mocked(api.tagPersonalityRelease);
const mockRollback = vi.mocked(api.rollbackPersonality);
const mockFetchDiff = vi.mocked(api.fetchPersonalityVersionDiff);

const VERSION = {
  id: 'pv-1',
  personalityId: 'pers-1',
  versionTag: '2026.3.2',
  snapshot: { name: 'FRIDAY', systemPrompt: 'You are helpful.' },
  snapshotMd: '# FRIDAY\nYou are helpful.',
  diffSummary: null,
  changedFields: ['name'],
  author: 'system',
  createdAt: 1700000000000,
};

const DRIFT = {
  lastTaggedVersion: '2026.3.2',
  lastTaggedAt: 1700000000000,
  uncommittedChanges: 1,
  changedFields: ['systemPrompt'],
  diffSummary: '--- tagged\n+++ current',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchVersions.mockResolvedValue({ versions: [VERSION], total: 1 });
  mockFetchDrift.mockResolvedValue(DRIFT);
});

describe('PersonalityVersionHistory', () => {
  it('renders version list after loading', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    // Tag appears in both drift badge and version list
    expect(screen.getAllByText('2026.3.2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows drift badge with uncommitted changes', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('1 uncommitted change')).toBeInTheDocument();
    });
  });

  it('shows up-to-date badge when no drift', async () => {
    mockFetchDrift.mockResolvedValue({
      ...DRIFT,
      uncommittedChanges: 0,
      changedFields: [],
    });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('up to date')).toBeInTheDocument();
    });
  });

  it('shows "No tagged releases yet" when no tags exist', async () => {
    mockFetchDrift.mockResolvedValue({
      lastTaggedVersion: null,
      lastTaggedAt: null,
      uncommittedChanges: 0,
      changedFields: [],
      diffSummary: '',
    });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('No tagged releases yet')).toBeInTheDocument();
    });
  });

  it('calls tagRelease when Tag Release button clicked', async () => {
    mockTagRelease.mockResolvedValue(VERSION as any);
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag Release'));
    await waitFor(() => {
      expect(mockTagRelease).toHaveBeenCalledWith('pers-1');
    });
  });

  it('shows error message on load failure', async () => {
    mockFetchVersions.mockRejectedValue(new Error('Network error'));
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows preview when version is clicked', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    // Click the version row (tag appears in both drift badge and version list)
    const tags = screen.getAllByText('2026.3.2');
    const versionTag = tags.find((el) => el.closest('div[class*="cursor-pointer"]'));
    fireEvent.click(versionTag!.closest('div[class*="cursor-pointer"]')!);
    await waitFor(() => {
      expect(screen.getByText(/Preview:/)).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    mockFetchVersions.mockReturnValue(new Promise(() => {})); // never resolves
    mockFetchDrift.mockReturnValue(new Promise(() => {}));
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    expect(screen.getByText('Loading version history...')).toBeInTheDocument();
  });

  it('shows empty state when no versions exist', async () => {
    mockFetchVersions.mockResolvedValue({ versions: [], total: 0 });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText(/No versions recorded yet/)).toBeInTheDocument();
    });
  });

  it('shows changedFields in version list', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('[name]')).toBeInTheDocument();
    });
  });

  it('shows author in version list', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('system')).toBeInTheDocument();
    });
  });

  it('handles rollback with confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRollback.mockResolvedValue({} as any);
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('rollback')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('rollback'));
    await waitFor(() => {
      expect(mockRollback).toHaveBeenCalledWith('pers-1', 'pv-1');
    });
    vi.restoreAllMocks();
  });

  it('does not rollback when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('rollback')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('rollback'));
    expect(mockRollback).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('shows error when rollback fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRollback.mockRejectedValue(new Error('Rollback denied'));
    render(<PersonalityVersionHistory personalityId="pers-1" />);
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
    mockTagRelease.mockRejectedValue(new Error('Tag conflict'));
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag Release'));
    await waitFor(() => {
      expect(screen.getByText('Tag conflict')).toBeInTheDocument();
    });
  });

  it('shows diff when diff button is clicked (multiple versions)', async () => {
    const VERSION2 = {
      ...VERSION,
      id: 'pv-2',
      versionTag: null,
      changedFields: ['systemPrompt'],
    };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockResolvedValue({ diff: '+added line\n-removed line\n@@ context @@' });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (2)')).toBeInTheDocument();
    });
    // The first version (not last) should have a diff button
    fireEvent.click(screen.getByText('diff'));
    await waitFor(() => {
      expect(mockFetchDiff).toHaveBeenCalledWith('pers-1', 'pv-1', 'pv-2');
    });
    await waitFor(() => {
      expect(screen.getByText(/Diff:/)).toBeInTheDocument();
    });
  });

  it('shows error when diff fails', async () => {
    const VERSION2 = { ...VERSION, id: 'pv-2', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockRejectedValue(new Error('Diff error'));
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('diff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('diff'));
    await waitFor(() => {
      expect(screen.getByText('Diff error')).toBeInTheDocument();
    });
  });

  it('closes diff viewer when Close button is clicked', async () => {
    const VERSION2 = { ...VERSION, id: 'pv-2', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [VERSION2, VERSION], total: 2 });
    mockFetchDiff.mockResolvedValue({ diff: '+line' });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
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

  it('toggles version preview off when same version is clicked again', async () => {
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Versions (1)')).toBeInTheDocument();
    });
    const tags = screen.getAllByText('2026.3.2');
    const versionRow = tags
      .find((el) => el.closest('div[class*="cursor-pointer"]'))!
      .closest('div[class*="cursor-pointer"]')!;
    // Click to open preview
    fireEvent.click(versionRow);
    await waitFor(() => {
      expect(screen.getByText(/Preview:/)).toBeInTheDocument();
    });
    // Click again to close preview
    fireEvent.click(versionRow);
    await waitFor(() => {
      expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument();
    });
  });

  it('shows "untagged" for versions without a tag (not the last one)', async () => {
    const UNTAGGED = { ...VERSION, id: 'pv-u', versionTag: null, changedFields: [] };
    const INITIAL = { ...VERSION, id: 'pv-init', versionTag: null, changedFields: [] };
    mockFetchVersions.mockResolvedValue({ versions: [UNTAGGED, INITIAL], total: 2 });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('untagged')).toBeInTheDocument();
      expect(screen.getByText('original')).toBeInTheDocument();
    });
  });

  it('shows delete tag button (x) next to version tag', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mockDeleteTag = vi.mocked(api.deletePersonalityTag);
    mockDeleteTag.mockResolvedValue(undefined as any);
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('Remove tag')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Remove tag'));
    await waitFor(() => {
      expect(mockDeleteTag).toHaveBeenCalledWith('pers-1', 'pv-1');
    });
    vi.restoreAllMocks();
  });

  it('shows plural "changes" for multiple uncommitted changes', async () => {
    mockFetchDrift.mockResolvedValue({ ...DRIFT, uncommittedChanges: 3 });
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('3 uncommitted changes')).toBeInTheDocument();
    });
  });

  it('calls Tag First Release when no tags exist', async () => {
    mockFetchDrift.mockResolvedValue({
      lastTaggedVersion: null,
      lastTaggedAt: null,
      uncommittedChanges: 0,
      changedFields: [],
      diffSummary: '',
    });
    mockTagRelease.mockResolvedValue({} as any);
    render(<PersonalityVersionHistory personalityId="pers-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tag First Release')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tag First Release'));
    await waitFor(() => {
      expect(mockTagRelease).toHaveBeenCalledWith('pers-1');
    });
  });
});
