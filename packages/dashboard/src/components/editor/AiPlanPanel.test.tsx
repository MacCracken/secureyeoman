// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiPlanPanel, ContextBadge, type AiPlan } from './AiPlanPanel';

const makePlan = (overrides: Partial<AiPlan> = {}): AiPlan => ({
  id: 'plan-1',
  title: 'Test Plan',
  steps: [
    { id: 's1', description: 'Read file', status: 'completed', toolName: 'read_file', files: ['/src/app.ts'], durationMs: 120 },
    { id: 's2', description: 'Analyze code', status: 'running', toolName: 'analyze', memoryRefs: ['context-1'] },
    { id: 's3', description: 'Write output', status: 'awaiting_approval', toolName: 'write_file' },
    { id: 's4', description: 'Verify', status: 'pending' },
  ],
  status: 'executing',
  createdAt: Date.now(),
  tokensUsed: 1500,
  ...overrides,
});

describe('ContextBadge', () => {
  it('renders file badge', () => {
    render(<ContextBadge type="file" label="app.ts" />);
    expect(screen.getByTestId('context-badge-file')).toBeInTheDocument();
    expect(screen.getByText('app.ts')).toBeInTheDocument();
  });

  it('renders memory badge', () => {
    render(<ContextBadge type="memory" label="context-1" />);
    expect(screen.getByTestId('context-badge-memory')).toBeInTheDocument();
  });

  it('renders tool badge', () => {
    render(<ContextBadge type="tool" label="read_file" />);
    expect(screen.getByTestId('context-badge-tool')).toBeInTheDocument();
  });

  it('calls onClick when provided', async () => {
    const onClick = vi.fn();
    render(<ContextBadge type="file" label="app.ts" onClick={onClick} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('context-badge-file'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('AiPlanPanel', () => {
  it('renders nothing when plan is null', () => {
    const { container } = render(<AiPlanPanel plan={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders plan title and progress', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    expect(screen.getByTestId('ai-plan-panel')).toBeInTheDocument();
    expect(screen.getByText('Test Plan')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument(); // 1 completed out of 4
  });

  it('renders all step rows', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    expect(screen.getByTestId('plan-step-s1')).toBeInTheDocument();
    expect(screen.getByTestId('plan-step-s2')).toBeInTheDocument();
    expect(screen.getByTestId('plan-step-s3')).toBeInTheDocument();
    expect(screen.getByTestId('plan-step-s4')).toBeInTheDocument();
  });

  it('shows approval buttons for awaiting_approval steps', () => {
    render(<AiPlanPanel plan={makePlan()} onApproveStep={vi.fn()} onRejectStep={vi.fn()} />);
    expect(screen.getByTestId('approve-s3')).toBeInTheDocument();
    expect(screen.getByTestId('reject-s3')).toBeInTheDocument();
  });

  it('calls onApproveStep when approve clicked', async () => {
    const onApprove = vi.fn();
    render(<AiPlanPanel plan={makePlan()} onApproveStep={onApprove} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('approve-s3'));
    expect(onApprove).toHaveBeenCalledWith('s3');
  });

  it('calls onRejectStep when reject clicked', async () => {
    const onReject = vi.fn();
    render(<AiPlanPanel plan={makePlan()} onRejectStep={onReject} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('reject-s3'));
    expect(onReject).toHaveBeenCalledWith('s3');
  });

  it('shows context badges on steps', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    // s1 has a file badge and tool badge
    expect(screen.getByText('app.ts')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
    // s2 has memory ref
    expect(screen.getByText('context-1')).toBeInTheDocument();
  });

  it('shows token count', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    expect(screen.getByText('1,500 tok')).toBeInTheDocument();
  });

  it('shows awaiting count badge', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    expect(screen.getByText('1 awaiting')).toBeInTheDocument();
  });

  it('shows duration for completed steps', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    expect(screen.getByText('120ms')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<AiPlanPanel plan={makePlan()} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.style.width).toBe('25%'); // 1/4
  });

  it('collapses steps on header click', async () => {
    render(<AiPlanPanel plan={makePlan()} />);
    const user = userEvent.setup();

    expect(screen.getByTestId('plan-steps')).toBeInTheDocument();
    await user.click(screen.getByText('Test Plan'));
    expect(screen.queryByTestId('plan-steps')).not.toBeInTheDocument();
  });

  it('shows pause/resume button when executing', () => {
    render(<AiPlanPanel plan={makePlan()} onPauseResume={vi.fn()} />);
    expect(screen.getByTestId('pause-resume')).toBeInTheDocument();
  });

  it('calls onPauseResume when clicked', async () => {
    const onPause = vi.fn();
    render(<AiPlanPanel plan={makePlan()} onPauseResume={onPause} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pause-resume'));
    expect(onPause).toHaveBeenCalled();
  });

  it('does not show pause button for completed plans', () => {
    render(<AiPlanPanel plan={makePlan({ status: 'completed' })} onPauseResume={vi.fn()} />);
    expect(screen.queryByTestId('pause-resume')).not.toBeInTheDocument();
  });

  it('calls onFileClick when file badge clicked', async () => {
    const onFile = vi.fn();
    render(<AiPlanPanel plan={makePlan()} onFileClick={onFile} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('app.ts'));
    expect(onFile).toHaveBeenCalledWith('/src/app.ts');
  });

  it('renders green progress bar for completed plan', () => {
    const plan = makePlan({
      status: 'completed',
      steps: [
        { id: 's1', description: 'Done', status: 'completed' },
      ],
    });
    render(<AiPlanPanel plan={plan} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar.className).toContain('bg-green-500');
  });

  it('renders red progress bar for failed plan', () => {
    const plan = makePlan({
      status: 'failed',
      steps: [
        { id: 's1', description: 'Failed step', status: 'failed' },
      ],
    });
    render(<AiPlanPanel plan={plan} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar.className).toContain('bg-red-500');
  });
});
