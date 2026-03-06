// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityWidget, type EntityState } from './EntityWidget';

// Mock canvas context and ResizeObserver
beforeEach(() => {
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
        this as unknown as ResizeObserver,
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
    createRadialGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    scale: vi.fn(),
  });

  // Mock requestAnimationFrame
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    // Don't actually run the animation loop in tests
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
});
