// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BranchExplorer } from './BranchExplorer';

vi.mock('../../api/client', () => ({
  fetchBranchTree: vi.fn().mockResolvedValue({
    conversationId: 'root',
    title: 'Root',
    forkMessageIndex: null,
    branchLabel: null,
    model: 'gpt-4',
    qualityScore: 0.8,
    messageCount: 5,
    children: [
      {
        conversationId: 'b1',
        title: 'Branch 1',
        forkMessageIndex: 2,
        branchLabel: 'test',
        model: 'claude-3',
        qualityScore: 0.6,
        messageCount: 3,
        children: [],
      },
    ],
  }),
}));

vi.mock('./BranchTreeView', () => ({
  BranchTreeView: () => <div data-testid="tree-view-inner">Tree View</div>,
}));

vi.mock('reactflow', () => ({
  __esModule: true,
  default: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('BranchExplorer', () => {
  const defaultProps = {
    conversationId: 'root',
    activeConversationId: 'root',
    onNavigate: vi.fn(),
    onCompare: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders with header and tabs', () => {
    renderWithQuery(<BranchExplorer {...defaultProps} />);
    expect(screen.getByTestId('branch-explorer')).toBeInTheDocument();
    expect(screen.getByTestId('branch-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tab-tree')).toBeInTheDocument();
    expect(screen.getByTestId('tab-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('tab-stats')).toBeInTheDocument();
    expect(screen.getByTestId('tab-compare')).toBeInTheDocument();
  });

  it('defaults to tree tab', () => {
    renderWithQuery(<BranchExplorer {...defaultProps} />);
    const treeTab = screen.getByTestId('tab-tree');
    expect(treeTab.className).toContain('border-primary');
  });

  it('switches to timeline tab', async () => {
    renderWithQuery(<BranchExplorer {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-timeline'));
    // Timeline renders even with empty data (shows empty state or entries)
    expect(screen.getByTestId('tab-timeline').className).toContain('border-primary');
  });

  it('switches to stats tab', async () => {
    renderWithQuery(<BranchExplorer {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-stats'));
    expect(screen.getByTestId('tab-stats').className).toContain('border-primary');
  });

  it('switches to compare tab', () => {
    renderWithQuery(<BranchExplorer {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-compare'));
    expect(screen.getByTestId('tab-compare').className).toContain('border-primary');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    renderWithQuery(<BranchExplorer {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('branch-explorer-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
