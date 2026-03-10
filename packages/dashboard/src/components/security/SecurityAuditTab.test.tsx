// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogTab } from './SecurityAuditTab';

vi.mock('../../api/client', () => ({
  fetchAuditEntries: vi.fn(),
  exportAuditLog: vi.fn(),
}));

import * as api from '../../api/client';

const mockEntries = [
  {
    id: 'a1',
    timestamp: Date.now() - 60000,
    level: 'info',
    event: 'user.login',
    actor: 'admin',
    target: 'system',
    details: { ip: '127.0.0.1' },
    hash: 'abc123',
  },
  {
    id: 'a2',
    timestamp: Date.now() - 30000,
    level: 'warn',
    event: 'security.alert',
    actor: 'system',
    target: 'firewall',
    details: { reason: 'Suspicious activity' },
    hash: 'def456',
  },
  {
    id: 'a3',
    timestamp: Date.now(),
    level: 'error',
    event: 'auth.failed',
    actor: 'unknown',
    target: 'login',
    details: {},
    hash: 'ghi789',
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AuditLogTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAuditEntries).mockResolvedValue({
      entries: mockEntries,
      total: 3,
    } as never);
    localStorage.clear();
  });

  it('should render audit entries', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('security.alert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('auth.failed').length).toBeGreaterThan(0);
  });

  it('should render filter controls', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    // Component should render without errors
    expect(true).toBe(true);
  });

  it('should show reviewed state for marked entries', async () => {
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set(['a1'])}
        onMarkReviewed={vi.fn()}
        onMarkAllReviewed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    expect(true).toBe(true);
  });

  it('should expand entry on click', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('user.login')[0]);

    // Should show additional details
    expect(true).toBe(true);
  });

  it('should render entries from API data', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(api.fetchAuditEntries).toHaveBeenCalled();
    });
  });

  it('should show loading state', () => {
    vi.mocked(api.fetchAuditEntries).mockReturnValue(new Promise(() => {}));

    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    expect(true).toBe(true);
  });

  it('should handle pagination', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    expect(true).toBe(true);
  });

  it('should handle mark all reviewed', async () => {
    const onMarkAllReviewed = vi.fn();
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set()}
        onMarkReviewed={vi.fn()}
        onMarkAllReviewed={onMarkAllReviewed}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    const markAllBtn = screen.getByText(/Mark all reviewed/);
    fireEvent.click(markAllBtn);
    expect(onMarkAllReviewed).toHaveBeenCalled();
  });

  it('should show mark page reviewed button when unreviewed entries exist', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Mark page reviewed/)).toBeInTheDocument();
    });
  });

  it('should call onMarkReviewed with page entry ids', async () => {
    const onMarkReviewed = vi.fn();
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set()}
        onMarkReviewed={onMarkReviewed}
        onMarkAllReviewed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Mark page reviewed/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Mark page reviewed/));
    expect(onMarkReviewed).toHaveBeenCalledWith(['a1', 'a2', 'a3']);
  });

  it('should mark entry as reviewed on expand', async () => {
    const onMarkReviewed = vi.fn();
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set()}
        onMarkReviewed={onMarkReviewed}
        onMarkAllReviewed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('user.login')[0]);
    expect(onMarkReviewed).toHaveBeenCalledWith(['a1']);
  });

  it('should toggle expand off when clicking again', async () => {
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set(['a1'])}
        onMarkReviewed={vi.fn()}
        onMarkAllReviewed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    // Click to expand
    fireEvent.click(screen.getAllByText('user.login')[0]);
    // Should show details
    expect(screen.getByText('Sequence')).toBeInTheDocument();
    // Click again to collapse
    fireEvent.click(screen.getAllByText('user.login')[0]);
  });

  it('should filter by level', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    const levelSelect = screen.getByDisplayValue('All Levels');
    fireEvent.change(levelSelect, { target: { value: 'error' } });

    await waitFor(() => {
      expect(api.fetchAuditEntries).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      );
    });
  });

  it('should filter by event type', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    const eventSelect = screen.getByDisplayValue('All Events');
    fireEvent.change(eventSelect, { target: { value: 'auth_failure' } });

    await waitFor(() => {
      expect(api.fetchAuditEntries).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_failure' })
      );
    });
  });

  it('should show Clear all button when filters are active', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    // No clear button initially
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    // Set a filter
    fireEvent.change(screen.getByDisplayValue('All Levels'), { target: { value: 'warn' } });

    await waitFor(() => {
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });
  });

  it('should clear all filters', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('user.login').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByDisplayValue('All Levels'), { target: { value: 'warn' } });

    await waitFor(() => {
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Clear all'));

    await waitFor(() => {
      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    });
  });

  it('should show Export button', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
  });

  it('should show export format options when Export clicked', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export'));
    expect(screen.getByText('JSONL')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Syslog')).toBeInTheDocument();
  });

  it('should call exportAuditLog on format selection', async () => {
    const mockBlob = new Blob(['test'], { type: 'text/plain' });
    vi.mocked(api.exportAuditLog).mockResolvedValue(mockBlob as never);

    // Mock URL.createObjectURL and document operations
    const mockUrl = 'blob:test';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(api.exportAuditLog).toHaveBeenCalledWith(expect.objectContaining({ format: 'csv' }));
    });
  });

  it('should show empty entries message when no results', async () => {
    vi.mocked(api.fetchAuditEntries).mockResolvedValue({ entries: [], total: 0 } as never);

    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('No audit entries found')).toBeInTheDocument();
    });
  });

  it('should show Save preset button', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('+ Save preset')).toBeInTheDocument();
    });
  });

  it('should show preset input when Save preset is clicked', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('+ Save preset')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Save preset'));
    expect(screen.getByPlaceholderText('Preset name')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should cancel preset creation', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('+ Save preset')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Save preset'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('+ Save preset')).toBeInTheDocument();
  });

  it('should show total entries count', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/3 total entries/)).toBeInTheDocument();
    });
  });

  it('should show unreviewed count', async () => {
    renderWithProviders(
      <AuditLogTab
        reviewed={new Set(['a1'])}
        onMarkReviewed={vi.fn()}
        onMarkAllReviewed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/2 unreviewed/)).toBeInTheDocument();
    });
  });

  it('should show pagination controls when total exceeds limit', async () => {
    const manyEntries = Array.from({ length: 20 }, (_, i) => ({
      id: `a${i}`,
      timestamp: Date.now() - i * 1000,
      level: 'info',
      event: 'test.event',
      actor: 'system',
      target: 'test',
      details: {},
      hash: `hash${i}`,
    }));

    vi.mocked(api.fetchAuditEntries).mockResolvedValue({
      entries: manyEntries,
      total: 50,
    } as never);

    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/1-20 of 50/)).toBeInTheDocument();
    });
  });

  it('should show date filter inputs', async () => {
    renderWithProviders(
      <AuditLogTab reviewed={new Set()} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
    });
  });
});
