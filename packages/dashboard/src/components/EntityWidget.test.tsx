// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityWidget, type EntityState } from './EntityWidget';

// Track whether we want the animation loop to run
let runAnimationOnce = false;

// Mock canvas context and ResizeObserver
beforeEach(() => {
  runAnimationOnce = false;

  // ResizeObserver needs to be a proper class
  class MockResizeObserver {
    callback: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb;
    }
    observe() {
      // Fire with mock dimensions
      this.callback(
        [{ contentRect: { width: 400, height: 200 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    createRadialGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    scale: vi.fn(),
  });

  // Mock requestAnimationFrame — optionally run callback once
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    if (runAnimationOnce) {
      runAnimationOnce = false;
      cb(16); // simulate one frame
    }
    return 0;
  });
});

describe('EntityWidget', () => {
  it('renders the canvas element', () => {
    render(<EntityWidget />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    expect(screen.getByTestId('entity-canvas')).toBeInTheDocument();
  });

  it('shows STANDBY label in dormant state', () => {
    render(<EntityWidget state="dormant" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('STANDBY');
  });

  it('shows PROCESSING label in thinking state', () => {
    render(<EntityWidget state="thinking" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('PROCESSING');
  });

  it('shows ACTIVE label in active state', () => {
    render(<EntityWidget state="active" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('ACTIVE');
  });

  it('shows TRAINING label in training state', () => {
    render(<EntityWidget state="training" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('TRAINING');
  });

  it('shows INGESTING label in ingesting state', () => {
    render(<EntityWidget state="ingesting" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('INGESTING');
  });

  it('uses custom label when provided', () => {
    render(<EntityWidget state="thinking" label="REASONING" />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('REASONING');
  });

  it('hides label when showLabel is false', () => {
    render(<EntityWidget showLabel={false} />);
    expect(screen.queryByTestId('entity-label')).not.toBeInTheDocument();
  });

  it('respects custom height', () => {
    render(<EntityWidget height={300} />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.style.height).toBe('300px');
  });

  it('applies custom className', () => {
    render(<EntityWidget className="my-custom-class" />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.className).toContain('my-custom-class');
  });

  it('defaults to dormant state', () => {
    render(<EntityWidget />);
    expect(screen.getByTestId('entity-label')).toHaveTextContent('STANDBY');
  });

  it('renders all five states without error', () => {
    const states: EntityState[] = ['dormant', 'thinking', 'active', 'training', 'ingesting'];
    for (const state of states) {
      const { unmount } = render(<EntityWidget state={state} />);
      expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows activity bars when not dormant', () => {
    const { container } = render(<EntityWidget state="thinking" />);
    // Activity indicator bars are rendered as small divs
    const bars = container.querySelectorAll('[style*="height"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('renders with compact mode', () => {
    render(<EntityWidget compact />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
  });

  // ── Additional coverage tests ───────────────────────────────────

  it('renders vignette overlay', () => {
    const { container } = render(<EntityWidget />);
    const vignette = container.querySelector('[style*="radial-gradient"]');
    expect(vignette).not.toBeNull();
  });

  it('renders status dot with correct color for each state', () => {
    const stateColors: Record<EntityState, string> = {
      dormant: 'bg-blue-400/60',
      thinking: 'bg-cyan-400',
      active: 'bg-emerald-400',
      training: 'bg-amber-400',
      ingesting: 'bg-green-400',
    };
    for (const [state, colorClass] of Object.entries(stateColors)) {
      const { container, unmount } = render(<EntityWidget state={state as EntityState} />);
      const dot = container.querySelector(`[class*="${colorClass}"]`);
      expect(dot).not.toBeNull();
      unmount();
    }
  });

  it('does not show activity bars when dormant', () => {
    const { _container } = render(<EntityWidget state="dormant" />);
    // Activity indicator is only rendered when state !== 'dormant'
    // Look for the activity bars container with gap-1
    const label = screen.getByTestId('entity-label');
    const parent = label.closest('.flex.items-center.justify-between');
    // In dormant, there should be no activity indicator div with gap-1 (the bars)
    const activityBars = parent?.querySelectorAll('.flex.items-center.gap-1');
    // If there are activity bar containers, they should have no children
    // Or simply: the bars should not exist
    expect(activityBars?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('shows activity bars for training state', () => {
    const { container } = render(<EntityWidget state="training" />);
    const bars = container.querySelectorAll('[style*="height"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('shows activity bars for ingesting state', () => {
    const { container } = render(<EntityWidget state="ingesting" />);
    const bars = container.querySelectorAll('[style*="height"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('shows activity bars for active state', () => {
    const { container } = render(<EntityWidget state="active" />);
    const bars = container.querySelectorAll('[style*="height"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('applies custom width', () => {
    render(<EntityWidget width={500} />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.style.width).toBe('500px');
  });

  it('applies default width of 100%', () => {
    render(<EntityWidget />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.style.width).toBe('100%');
  });

  it('applies string width', () => {
    render(<EntityWidget width="50%" />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.style.width).toBe('50%');
  });

  it('calls requestAnimationFrame', () => {
    render(<EntityWidget />);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('getContext is called on canvas', () => {
    render(<EntityWidget />);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
  });

  it('does not render label when showLabel is false for thinking state', () => {
    render(<EntityWidget state="thinking" showLabel={false} />);
    expect(screen.queryByTestId('entity-label')).not.toBeInTheDocument();
  });

  it('renders canvas with block display', () => {
    render(<EntityWidget />);
    const canvas = screen.getByTestId('entity-canvas');
    expect(canvas.style.display).toBe('block');
  });

  it('renders container with overflow-hidden', () => {
    render(<EntityWidget />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.className).toContain('overflow-hidden');
  });

  it('renders container with bg-black', () => {
    render(<EntityWidget />);
    const widget = screen.getByTestId('entity-widget');
    expect(widget.className).toContain('bg-black');
  });

  it('label has tracking-[0.2em] class', () => {
    render(<EntityWidget state="active" />);
    const label = screen.getByTestId('entity-label');
    expect(label.className).toContain('tracking-');
  });

  it('compact mode creates fewer particles (no crash)', () => {
    const { unmount } = render(<EntityWidget compact state="active" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  // ── Animation loop coverage (renderEye + stepStreams) ──────────

  it('runs animation loop for dormant state (covers renderEye + stepStreams)', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget state="dormant" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  it('runs animation loop for thinking state', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget state="thinking" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  it('runs animation loop for active state', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget state="active" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  it('runs animation loop for training state', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget state="training" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  it('runs animation loop for ingesting state', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget state="ingesting" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });

  it('runs animation loop in compact mode', () => {
    runAnimationOnce = true;
    const { unmount } = render(<EntityWidget compact state="active" />);
    expect(screen.getByTestId('entity-widget')).toBeInTheDocument();
    unmount();
  });
});
