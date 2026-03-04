import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExcalidrawWidget } from './ExcalidrawWidget';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ documents: [] }),
  });
});

const SAMPLE_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [
    { type: 'rectangle', x: 10, y: 10, width: 100, height: 50, strokeColor: '#000' },
    { type: 'text', x: 20, y: 20, width: 80, height: 30, text: 'Hello', fontSize: 16 },
  ],
});

describe('ExcalidrawWidget', () => {
  it('renders empty state when no scene JSON is provided', () => {
    render(<ExcalidrawWidget />);
    expect(screen.getByText(/Paste Excalidraw JSON/i)).toBeInTheDocument();
  });

  it('renders SVG when valid scene JSON is provided', () => {
    const { container } = render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('toggles to JSON view when JSON button is clicked', () => {
    render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);
    const jsonBtn = screen.getByText('JSON');
    fireEvent.click(jsonBtn);
    // Now should show SVG button and textarea
    expect(screen.getByText('SVG')).toBeInTheDocument();
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('has Save to KB button', () => {
    render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);
    expect(screen.getByText('Save to KB')).toBeInTheDocument();
  });

  it('shows invalid scene message for bad JSON', () => {
    render(<ExcalidrawWidget sceneJson="{invalid json}" />);
    expect(screen.getByText('Invalid scene JSON')).toBeInTheDocument();
  });
});
