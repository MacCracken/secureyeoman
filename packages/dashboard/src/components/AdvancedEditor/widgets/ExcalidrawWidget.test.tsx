import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExcalidrawWidget } from './ExcalidrawWidget';

// ── Mocks ────────────────────────────────────────────────────────────

const mockUpdateScene = vi.fn();

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: function MockExcalidraw(props: Record<string, unknown>) {
    // Store the API ref callback so tests can call updateScene
    const apiRef = props.excalidrawAPI as ((api: unknown) => void) | undefined;
    if (apiRef) {
      apiRef({ updateScene: mockUpdateScene, getSceneElements: () => [] });
    }
    return <div data-testid="excalidraw-editor" />;
  },
}));

const mockSubscribe = vi.fn();
let mockLastMessage: unknown = null;

vi.mock('../../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    reconnecting: false,
    lastMessage: mockLastMessage,
    send: vi.fn(),
    subscribe: mockSubscribe,
    unsubscribe: vi.fn(),
  }),
}));

// The widget's KB calls go through the authenticated API client.
vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/client')>();
  return {
    ...actual,
    listDocuments: vi.fn(),
    fetchDocument: vi.fn(),
    ingestExcalidraw: vi.fn(),
  };
});

import * as api from '../../../api/client';

const mockListDocuments = vi.mocked(api.listDocuments);
const mockFetchDocument = vi.mocked(api.fetchDocument);
const mockIngestExcalidraw = vi.mocked(api.ingestExcalidraw);

beforeEach(() => {
  mockListDocuments.mockReset();
  mockListDocuments.mockResolvedValue({ documents: [], total: 0 });
  mockFetchDocument.mockReset();
  mockIngestExcalidraw.mockReset();
  mockUpdateScene.mockReset();
  mockSubscribe.mockReset();
  mockLastMessage = null;
});

const SAMPLE_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [
    { type: 'rectangle', x: 10, y: 10, width: 100, height: 50, strokeColor: '#000' },
    { type: 'text', x: 20, y: 20, width: 80, height: 30, text: 'Hello', fontSize: 16 },
  ],
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExcalidrawWidget', () => {
  it('renders editor in Draw mode by default', async () => {
    render(<ExcalidrawWidget />);
    expect(await screen.findByTestId('excalidraw-editor')).toBeInTheDocument();
    // Draw button should be active
    const drawBtn = screen.getByText('Draw');
    expect(drawBtn).toBeInTheDocument();
  });

  it('toggles between Draw, JSON, and SVG modes', async () => {
    render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);

    // Start in Draw mode
    expect(await screen.findByTestId('excalidraw-editor')).toBeInTheDocument();

    // Switch to JSON
    fireEvent.click(screen.getByText('JSON'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Switch to SVG
    fireEvent.click(screen.getByText('SVG'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('excalidraw-editor')).not.toBeInTheDocument();

    // Back to Draw
    fireEvent.click(screen.getByText('Draw'));
    expect(await screen.findByTestId('excalidraw-editor')).toBeInTheDocument();
  });

  it('calls onConfigChange on scene change (debounced)', async () => {
    vi.useFakeTimers();
    const onConfigChange = vi.fn();
    render(<ExcalidrawWidget onConfigChange={onConfigChange} />);

    // The mock Excalidraw calls excalidrawAPI immediately, so the API is set.
    // Simulate a scene change via the onChange that ExcalidrawEditorLazy passes through.
    // Since we mock the entire module, we need to verify the debounce via jsonText → onConfigChange.

    // Switch to JSON and edit
    fireEvent.click(screen.getByText('JSON'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: SAMPLE_SCENE } });
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ excalidrawSceneJson: SAMPLE_SCENE })
    );

    vi.useRealTimers();
  });

  it('Save to KB triggers POST', async () => {
    mockIngestExcalidraw.mockResolvedValue({ document: { id: 'doc-1' } } as any);

    render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);

    // Switch to JSON mode so scene parses from jsonText
    fireEvent.click(screen.getByText('JSON'));

    const user = userEvent.setup();
    const saveBtn = screen.getByText('Save to KB');
    await user.click(saveBtn);

    // Should have called ingest-excalidraw (through the authenticated client)
    expect(mockIngestExcalidraw).toHaveBeenCalledTimes(1);
    expect(mockIngestExcalidraw.mock.calls[0][0]).toEqual(
      expect.objectContaining({ elements: expect.any(Array) })
    );
  });

  it('Load from KB calls updateScene', async () => {
    const scenePayload = { elements: [{ type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }] };
    mockListDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-1', title: 'Test', format: 'excalidraw' },
        // Not a scene: the server ignores format filters, the widget must not list it.
        { id: 'doc-2', title: 'Manual', format: 'pdf' },
      ],
      total: 2,
    } as any);
    mockFetchDocument.mockResolvedValue({
      document: { id: 'doc-1', title: 'Test', metadata: { excalidrawScene: scenePayload } },
    } as any);

    render(<ExcalidrawWidget />);

    // Wait for KB docs to load
    const select = await screen.findByDisplayValue('Load from KB...');
    expect(screen.getByRole('option', { name: 'Test' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Manual' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'doc-1' } });

    // Wait for the load to complete
    await vi.waitFor(() => {
      expect(mockUpdateScene).toHaveBeenCalledWith({
        elements: scenePayload.elements,
      });
    });
  });

  it('WebSocket excalidraw message updates editor', async () => {
    const wsScene = { elements: [{ type: 'ellipse', x: 5, y: 5, width: 40, height: 40 }] };
    mockLastMessage = {
      type: 'update',
      channel: 'excalidraw',
      payload: { documentId: 'doc-2', scene: wsScene, source: 'api' },
      timestamp: Date.now(),
      sequence: 1,
    };

    render(<ExcalidrawWidget />);

    await vi.waitFor(() => {
      expect(mockUpdateScene).toHaveBeenCalledWith({
        elements: wsScene.elements,
      });
    });
  });

  it('shows error for invalid JSON in SVG mode', () => {
    render(<ExcalidrawWidget sceneJson="{invalid json}" />);
    // Switch to SVG
    fireEvent.click(screen.getByText('SVG'));
    expect(screen.getByText('Invalid scene JSON')).toBeInTheDocument();
  });

  it('subscribes to excalidraw WebSocket channel', () => {
    render(<ExcalidrawWidget />);
    expect(mockSubscribe).toHaveBeenCalledWith(['excalidraw']);
  });

  it('has auto-sync checkbox', () => {
    render(<ExcalidrawWidget />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('renders SVG when valid scene JSON is provided in SVG mode', () => {
    const { container } = render(<ExcalidrawWidget sceneJson={SAMPLE_SCENE} />);
    fireEvent.click(screen.getByText('SVG'));
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
