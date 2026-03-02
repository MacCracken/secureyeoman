import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BranchTreeView } from './BranchTreeView';
import type { BranchTreeNode } from '../../types';

// Mock reactflow — it doesn't render in jsdom
vi.mock('reactflow', () => {
  const MockReactFlow = (props: {
    nodes: { id: string; data: { label: React.ReactNode } }[];
    edges: unknown[];
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  }) => (
    <div data-testid="mock-reactflow">
      {props.nodes.map((n) => (
        <div
          key={n.id}
          data-testid={`tree-node-${n.id}`}
          onClick={(e) => props.onNodeClick?.(e, n)}
        >
          {n.data.label}
        </div>
      ))}
    </div>
  );
  return {
    __esModule: true,
    default: MockReactFlow,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});

vi.mock('reactflow/dist/style.css', () => ({}));

vi.mock('../../api/client', () => ({
  fetchBranchTree: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

const { fetchBranchTree } = await import('../../api/client');

const TREE: BranchTreeNode = {
  conversationId: 'root',
  title: 'Root Conversation',
  forkMessageIndex: null,
  branchLabel: null,
  model: null,
  qualityScore: 0.85,
  messageCount: 10,
  children: [
    {
      conversationId: 'branch-1',
      title: 'Branch A',
      forkMessageIndex: 3,
      branchLabel: 'experiment-a',
      model: 'gpt-4',
      qualityScore: 0.72,
      messageCount: 4,
      children: [],
    },
    {
      conversationId: 'branch-2',
      title: 'Branch B',
      forkMessageIndex: 5,
      branchLabel: null,
      model: null,
      qualityScore: null,
      messageCount: 6,
      children: [],
    },
  ],
};

function renderView(props?: Partial<Parameters<typeof BranchTreeView>[0]>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BranchTreeView
        conversationId="root"
        activeConversationId="root"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('BranchTreeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBranchTree).mockResolvedValue(TREE);
  });

  it('renders the panel', async () => {
    renderView();
    expect(screen.getByTestId('branch-tree-view')).toBeInTheDocument();
    expect(screen.getByText('Branch Tree')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(fetchBranchTree).mockReturnValue(new Promise(() => {}));
    renderView();
    expect(screen.getByText('Loading tree...')).toBeInTheDocument();
  });

  it('renders tree nodes', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-root')).toBeInTheDocument();
      expect(screen.getByTestId('tree-node-branch-1')).toBeInTheDocument();
      expect(screen.getByTestId('tree-node-branch-2')).toBeInTheDocument();
    });
  });

  it('renders node titles', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Root Conversation')).toBeInTheDocument();
      expect(screen.getByText('Branch A')).toBeInTheDocument();
      expect(screen.getByText('Branch B')).toBeInTheDocument();
    });
  });

  it('renders quality score', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('0.85')).toBeInTheDocument();
    });
  });

  it('navigates on node click', async () => {
    const onNavigate = vi.fn();
    renderView({ onNavigate });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('tree-node-branch-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tree-node-branch-1'));
    expect(onNavigate).toHaveBeenCalledWith('branch-1');
  });

  it('renders branch label', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('experiment-a')).toBeInTheDocument();
    });
  });

  it('calls onClose', async () => {
    const onClose = vi.fn();
    renderView({ onClose });
    const user = userEvent.setup();
    // The close X button
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find((b) => b.getAttribute('class')?.includes('btn-ghost'));
    if (closeBtn) await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
