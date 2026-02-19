// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebGLGraph } from './WebGLGraph';

// ── Mocks ───────────────────────────────────────────────────────────

let capturedRegisterHandlers: Record<string, (args: unknown) => void> = {};
const mockLoadGraph = vi.fn();
const mockRegisterEvents = vi.fn((handlers: Record<string, (args: unknown) => void>) => {
  capturedRegisterHandlers = handlers;
});

vi.mock('@react-sigma/core', () => ({
  SigmaContainer: ({ children, style }: { children: React.ReactNode; style: React.CSSProperties }) => (
    <div data-testid="sigma-container" style={style}>
      {children}
    </div>
  ),
  useLoadGraph: () => mockLoadGraph,
  useRegisterEvents: () => mockRegisterEvents,
  useSigma: vi.fn(() => ({ getCamera: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('@react-sigma/core/lib/react-sigma.min.css', () => ({}));

vi.mock('graphology-layout-forceatlas2', () => ({
  default: { assign: vi.fn() },
}));

// Spy functions to capture addNode/addEdge calls
const addNodeSpy = vi.fn();
const addEdgeSpy = vi.fn();
const hasNodeSpy = vi.fn(() => true);

vi.mock('graphology', () => {
  // Must use a regular function (not arrow) so it can be used with `new`
  function MockDirectedGraph(this: Record<string, unknown>) {
    this.addNode = addNodeSpy;
    this.addEdge = addEdgeSpy;
    this.hasNode = hasNodeSpy;
    this.order = 3;
  }
  return { default: MockDirectedGraph };
});

// ── WebGL detection helper ──────────────────────────────────────────

const originalCreateElement = document.createElement.bind(document);

function mockWebGLSupport(available: boolean) {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return { getContext: () => (available ? {} : null) } as unknown as HTMLElement;
    }
    return originalCreateElement(tag);
  });
}

// ── Fixtures ────────────────────────────────────────────────────────

const sampleNodes = [
  { id: 'n1', label: 'Node 1', color: '#ff0000', size: 8 },
  { id: 'n2', label: 'Node 2' },
  { id: 'n3', label: 'Node 3', color: '#00ff00' },
];

const sampleEdges = [
  { source: 'n1', target: 'n2' },
  { source: 'n2', target: 'n3' },
];

// ── Tests ────────────────────────────────────────────────────────────

describe('WebGLGraph', () => {
  beforeEach(() => {
    capturedRegisterHandlers = {};
    mockLoadGraph.mockClear();
    mockRegisterEvents.mockClear();
    addNodeSpy.mockClear();
    addEdgeSpy.mockClear();
    hasNodeSpy.mockClear().mockReturnValue(true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sigma-container when WebGL is available', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    expect(await screen.findByTestId('sigma-container')).toBeInTheDocument();
  });

  it('renders fallback when WebGL is unavailable', () => {
    mockWebGLSupport(false);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.queryByTestId('sigma-container')).not.toBeInTheDocument();
    expect(screen.getByText(/WebGL is not available/i)).toBeInTheDocument();
  });

  it('passes correct node count to graph builder', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    await screen.findByTestId('sigma-container');
    expect(mockLoadGraph).toHaveBeenCalled();
    expect(addNodeSpy).toHaveBeenCalledTimes(3);
  });

  it('passes correct edge count to graph builder', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    await screen.findByTestId('sigma-container');
    expect(addEdgeSpy).toHaveBeenCalledTimes(2);
  });

  it('fires onNodeClick when node is clicked', async () => {
    mockWebGLSupport(true);
    const handler = vi.fn();
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} onNodeClick={handler} />);
    await screen.findByTestId('sigma-container');

    expect(mockRegisterEvents).toHaveBeenCalled();
    capturedRegisterHandlers.clickNode?.({ node: 'n1' });
    expect(handler).toHaveBeenCalledWith('n1');
  });

  it('applies custom height to container', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} height={300} />);
    const container = await screen.findByTestId('sigma-container');
    expect(container.style.height).toBe('300px');
  });

  it('handles empty nodes and edges without crashing', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={[]} edges={[]} />);
    await screen.findByTestId('sigma-container');
    expect(mockLoadGraph).toHaveBeenCalled();
    expect(addNodeSpy).toHaveBeenCalledTimes(0);
  });
});
