// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchCompareSelector } from './BranchCompareSelector';
import type { BranchTreeNode } from '../../types';

function makeTree(): BranchTreeNode {
  return {
    conversationId: 'root',
    title: 'Root',
    forkMessageIndex: null,
    branchLabel: null,
    model: 'gpt-4',
    qualityScore: 0.85,
    messageCount: 10,
    children: [
      {
        conversationId: 'branch-1',
        title: 'Branch One',
        forkMessageIndex: 3,
        branchLabel: 'test',
        model: 'claude-3',
        qualityScore: 0.72,
        messageCount: 5,
        children: [],
      },
      {
        conversationId: 'branch-2',
        title: 'Branch Two',
        forkMessageIndex: 5,
        branchLabel: null,
        model: 'gpt-4',
        qualityScore: 0.91,
        messageCount: 8,
        children: [],
      },
    ],
  };
}

describe('BranchCompareSelector', () => {
  it('renders nothing when tree has fewer than 2 branches', () => {
    const singleNode: BranchTreeNode = {
      conversationId: 'root',
      title: 'Root',
      forkMessageIndex: null,
      branchLabel: null,
      model: null,
      qualityScore: null,
      messageCount: 1,
      children: [],
    };
    const { container } = render(<BranchCompareSelector tree={singleNode} onCompare={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders selector with branches', () => {
    render(<BranchCompareSelector tree={makeTree()} onCompare={vi.fn()} />);
    expect(screen.getByTestId('branch-compare-selector')).toBeInTheDocument();
    expect(screen.getByTestId('compare-source-select')).toBeInTheDocument();
    expect(screen.getByTestId('compare-target-select')).toBeInTheDocument();
  });

  it('disables compare button when selections are incomplete', () => {
    render(<BranchCompareSelector tree={makeTree()} onCompare={vi.fn()} />);
    expect(screen.getByTestId('compare-button')).toBeDisabled();
  });

  it('calls onCompare when two different branches selected', () => {
    const onCompare = vi.fn();
    render(<BranchCompareSelector tree={makeTree()} onCompare={onCompare} />);

    fireEvent.change(screen.getByTestId('compare-source-select'), {
      target: { value: 'root' },
    });
    fireEvent.change(screen.getByTestId('compare-target-select'), {
      target: { value: 'branch-1' },
    });
    fireEvent.click(screen.getByTestId('compare-button'));

    expect(onCompare).toHaveBeenCalledWith('root', 'branch-1');
  });

  it('disables compare when same branch selected for both', () => {
    render(<BranchCompareSelector tree={makeTree()} onCompare={vi.fn()} />);

    fireEvent.change(screen.getByTestId('compare-source-select'), {
      target: { value: 'root' },
    });
    fireEvent.change(screen.getByTestId('compare-target-select'), {
      target: { value: 'root' },
    });

    expect(screen.getByTestId('compare-button')).toBeDisabled();
  });

  it('renders null when tree is null', () => {
    const { container } = render(<BranchCompareSelector tree={null} onCompare={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
