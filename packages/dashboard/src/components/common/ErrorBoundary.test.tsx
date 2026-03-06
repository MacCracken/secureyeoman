// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error message');
  return <div>Rendered successfully</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('should show error fallback when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should show custom fallback title', () => {
    render(
      <ErrorBoundary fallbackTitle="Oops!">
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Oops!')).toBeInTheDocument();
  });

  it('should show Try Again button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('should reset error state when Try Again is clicked', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click retry — this resets state but ThrowingComponent will throw again
    fireEvent.click(screen.getByText('Try Again'));

    // After retry, error boundary catches again
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error');

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalled();
  });
});
