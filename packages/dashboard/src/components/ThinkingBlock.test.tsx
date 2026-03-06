// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingBlock } from './ThinkingBlock';

describe('ThinkingBlock', () => {
  it('returns null when thinking is empty', () => {
    const { container } = render(<ThinkingBlock thinking="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders collapsed by default with word count', () => {
    render(<ThinkingBlock thinking="hello world test" />);
    expect(screen.getByText(/Thought for ~3 words/)).toBeInTheDocument();
  });

  it('does not show thinking text when collapsed', () => {
    render(<ThinkingBlock thinking="secret inner thoughts" />);
    expect(screen.queryByText('secret inner thoughts')).not.toBeInTheDocument();
  });

  it('expands to show thinking text on click', () => {
    render(<ThinkingBlock thinking="detailed reasoning here" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('detailed reasoning here')).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    render(<ThinkingBlock thinking="some thoughts" />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('some thoughts')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('some thoughts')).not.toBeInTheDocument();
  });

  it('shows "Thinking..." when live is true', () => {
    render(<ThinkingBlock thinking="in progress" live />);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
  });

  it('auto-opens when live is true', () => {
    render(<ThinkingBlock thinking="streaming content" live />);
    expect(screen.getByText('streaming content')).toBeInTheDocument();
  });

  it('shows iteration count when multiple iterations', () => {
    const text = 'first\n\n---\n\nsecond\n\n---\n\nthird';
    render(<ThinkingBlock thinking={text} />);
    expect(screen.getByText(/3 iterations/)).toBeInTheDocument();
  });

  it('does not show iteration count for single iteration', () => {
    render(<ThinkingBlock thinking="just one block" />);
    expect(screen.queryByText(/iteration/)).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    render(<ThinkingBlock thinking="test" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
