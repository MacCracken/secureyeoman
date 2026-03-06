// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VoiceOverlay } from './VoiceOverlay';

describe('VoiceOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when not active and not visible', () => {
    const { container } = render(
      <VoiceOverlay isActive={false} audioLevel={0} duration={0} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when isActive is true', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0.5} duration={0} />);
    expect(screen.getByText('Listening...')).toBeInTheDocument();
  });

  it('shows "Speak now..." when active with no transcript', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={0} />);
    expect(screen.getByText('Speak now...')).toBeInTheDocument();
  });

  it('shows transcript when provided', () => {
    render(
      <VoiceOverlay isActive={true} audioLevel={0.5} duration={0} transcript="Hello world" />
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('You:')).toBeInTheDocument();
  });

  it('does not show "Speak now..." when transcript is present', () => {
    render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} transcript="hi" />
    );
    expect(screen.queryByText('Speak now...')).not.toBeInTheDocument();
  });

  it('shows error message when error is set', () => {
    render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} error="Microphone failed" />
    );
    expect(screen.getByText('Microphone failed')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('does not show audio level bar or speak-now when error is set', () => {
    render(
      <VoiceOverlay isActive={true} audioLevel={0.8} duration={0} error="fail" />
    );
    expect(screen.queryByText('Speak now...')).not.toBeInTheDocument();
  });

  it('formats duration as seconds when under a minute', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={5000} />);
    expect(screen.getByText('0:05')).toBeInTheDocument();
  });

  it('formats duration as minutes:seconds when over a minute', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={65000} />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('formats zero duration correctly', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={0} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('pads single-digit seconds', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={7000} />);
    expect(screen.getByText('0:07')).toBeInTheDocument();
  });

  it('shows "Release to send" when active', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={0} />);
    expect(screen.getByText('Release to send')).toBeInTheDocument();
  });

  it('shows "Hold to talk" and "Released" when deactivated but still visible', () => {
    const { rerender } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    expect(screen.getByText('Hold to talk')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
  });

  it('becomes invisible after 500ms timeout when deactivated', () => {
    const { rerender, container } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    expect(container.innerHTML).not.toBe('');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('clears timeout when reactivated before fade-out completes', () => {
    const { rerender } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    // Deactivate
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    // Reactivate before 500ms
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<VoiceOverlay isActive={true} audioLevel={0} duration={0} />);
    // Advance past the original timeout
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Should still be visible
    expect(screen.getByText('Listening...')).toBeInTheDocument();
  });

  it('shows the keyboard shortcut hint', () => {
    render(<VoiceOverlay isActive={true} audioLevel={0} duration={0} />);
    expect(screen.getByText('Hold Ctrl+Shift+V')).toBeInTheDocument();
  });

  it('sets audio level bar width based on audioLevel prop', () => {
    const { container } = render(
      <VoiceOverlay isActive={true} audioLevel={0.75} duration={0} />
    );
    const bar = container.querySelector('[style*="width: 75%"]');
    expect(bar).toBeTruthy();
  });

  it('shows animate-pulse indicator when active', () => {
    const { container } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    const pulse = container.querySelector('.animate-pulse');
    expect(pulse).toBeTruthy();
  });

  it('does not show animate-pulse when inactive', () => {
    const { rerender, container } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    const pulse = container.querySelector('.animate-pulse');
    expect(pulse).toBeFalsy();
  });

  it('applies opacity-0 class when not active (fade-out)', () => {
    const { rerender, container } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    expect(container.innerHTML).toContain('opacity-0');
  });

  it('applies opacity-100 class when active', () => {
    const { container } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    expect(container.innerHTML).toContain('opacity-100');
  });

  it('does not show transcript section when not active and no transcript', () => {
    const { rerender } = render(
      <VoiceOverlay isActive={true} audioLevel={0} duration={0} />
    );
    rerender(<VoiceOverlay isActive={false} audioLevel={0} duration={0} />);
    expect(screen.queryByText('Speak now...')).not.toBeInTheDocument();
    expect(screen.queryByText('You:')).not.toBeInTheDocument();
  });
});
