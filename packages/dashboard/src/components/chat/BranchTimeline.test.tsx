// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchTimeline } from './BranchTimeline';
import type { BranchTreeNode } from '../../types';

function makeTree(): BranchTreeNode {
  return {
    conversationId: 'root',
    title: 'Root Conversation',
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
        branchLabel: 'experiment-A',
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
        qualityScore: null,
        messageCount: 8,
        children: [],
      },
    ],
  };
}

describe('BranchTimeline', () => {
  it('shows empty state when tree is null', () => {
    render(
      <BranchTimeline tree={null} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getByTestId('branch-timeline-empty')).toBeInTheDocument();
  });

  it('renders all branches in order', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getByTestId('timeline-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-entry-1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-entry-2')).toBeInTheDocument();
  });

  it('shows quality scores', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getByTestId('quality-0')).toHaveTextContent('0.850');
    expect(screen.getByTestId('quality-1')).toHaveTextContent('0.720');
  });

  it('highlights active conversation', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId="branch-1" onNavigate={vi.fn()} />
    );
    const entry = screen.getByTestId('timeline-entry-1');
    const button = entry.querySelector('button');
    expect(button?.className).toContain('ring-primary');
  });

  it('calls onNavigate when clicking an entry', () => {
    const onNavigate = vi.fn();
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={onNavigate} />
    );
    const entry = screen.getByTestId('timeline-entry-1');
    fireEvent.click(entry.querySelector('button')!);
    expect(onNavigate).toHaveBeenCalledWith('branch-1');
  });

  it('shows branch labels and fork indices', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getByText('experiment-A')).toBeInTheDocument();
    expect(screen.getByText('forked @ msg 3')).toBeInTheDocument();
  });

  it('shows model badges', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getAllByText('gpt-4')).toHaveLength(2);
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows depth indicators', () => {
    render(
      <BranchTimeline tree={makeTree()} activeConversationId={null} onNavigate={vi.fn()} />
    );
    expect(screen.getByText('depth 0')).toBeInTheDocument();
    expect(screen.getAllByText('depth 1')).toHaveLength(2);
  });
});
