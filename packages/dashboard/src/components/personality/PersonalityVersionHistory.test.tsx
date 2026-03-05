// @vitest-environment jsdom
/**
 * PersonalityVersionHistory Tests — Phase 114
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  fetchPersonalityVersions: vi.fn(),
  fetchPersonalityDrift: vi.fn(),
  tagPersonalityRelease: vi.fn(),
  rollbackPersonality: vi.fn(),
  fetchPersonalityVersionDiff: vi.fn(),
}));

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
});
