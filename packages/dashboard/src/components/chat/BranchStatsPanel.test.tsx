// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BranchStatsPanel } from './BranchStatsPanel';
import type { BranchTreeNode } from '../../types';

function makeTree(overrides: Partial<BranchTreeNode> = {}): BranchTreeNode {
  return {
    conversationId: 'root',
    title: 'Root Conversation',
    forkMessageIndex: null,
    branchLabel: null,
    model: 'gpt-4',
    qualityScore: 0.85,
    messageCount: 10,
    children: [],
    ...overrides,
  };
}

describe('BranchStatsPanel', () => {
  it('shows empty state when tree is null', () => {
    render(<BranchStatsPanel tree={null} />);
    expect(screen.getByTestId('branch-stats-empty')).toBeInTheDocument();
  });

  it('shows stats for a single-node tree', () => {
    render(<BranchStatsPanel tree={makeTree()} />);
    expect(screen.getByTestId('stat-total-branches')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-max-depth')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-leaf-branches')).toHaveTextContent('1');
  });

  it('computes stats across branches', () => {
    const tree = makeTree({
      qualityScore: 0.9,
      model: 'gpt-4',
      children: [
        makeTree({
          conversationId: 'child-1',
          title: 'Branch A',
          qualityScore: 0.7,
          model: 'gpt-4',
          children: [
            makeTree({
              conversationId: 'grandchild',
              title: 'Deep Branch',
              qualityScore: 0.5,
              model: 'claude-3',
            }),
          ],
        }),
        makeTree({
          conversationId: 'child-2',
          title: 'Branch B',
          qualityScore: 0.3,
          model: 'claude-3',
        }),
      ],
    });

    render(<BranchStatsPanel tree={tree} />);
    expect(screen.getByTestId('stat-total-branches')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-max-depth')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-leaf-branches')).toHaveTextContent('2');
  });

  it('renders quality histogram', () => {
    const tree = makeTree({ qualityScore: 0.85 });
    render(<BranchStatsPanel tree={tree} />);
    expect(screen.getByTestId('quality-histogram')).toBeInTheDocument();
  });

  it('renders model breakdown', () => {
    const tree = makeTree({
      model: 'gpt-4',
      children: [makeTree({ conversationId: 'c1', model: 'claude-3' })],
    });
    render(<BranchStatsPanel tree={tree} />);
    expect(screen.getByTestId('model-breakdown')).toBeInTheDocument();
  });

  it('handles tree with no quality scores', () => {
    const tree = makeTree({ qualityScore: null, model: null });
    render(<BranchStatsPanel tree={tree} />);
    expect(screen.getByTestId('stat-avg-quality')).toHaveTextContent('—');
  });
});
