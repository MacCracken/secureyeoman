// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WebGLGraph } from './WebGLGraph';
import { useTheme, type ThemeId } from '../hooks/useTheme';
// Imported after vi.mock hoisting — these resolve to the mocked versions
import _forceAtlas2 from 'graphology-layout-forceatlas2';
import _dagre from 'dagre';
import _drawHover from 'sigma/rendering/canvas/hover';

// ── Mocks ───────────────────────────────────────────────────────────

let capturedRegisterHandlers: Record<string, (args: unknown) => void> = {};
const mockLoadGraph = vi.fn();
const mockRegisterEvents = vi.fn((handlers: Record<string, (args: unknown) => void>) => {
  capturedRegisterHandlers = handlers;
});
const mockSetSettings = vi.fn();

vi.mock('@react-sigma/core', () => ({
  SigmaContainer: ({
    children,
    style,
  }: {
    children: React.ReactNode;
    style: React.CSSProperties;
  }) => (
    <div data-testid="sigma-container" style={style}>
      {children}
    </div>
  ),
  useLoadGraph: () => mockLoadGraph,
  useRegisterEvents: () => mockRegisterEvents,
  useSetSettings: () => mockSetSettings,
  useSigma: vi.fn(() => ({ getCamera: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('@react-sigma/core/lib/react-sigma.min.css', () => ({}));

vi.mock('sigma/rendering/canvas/hover', () => ({ default: vi.fn() }));

// Pure vi.fn() inside factories — no external variable references needed
vi.mock('graphology-layout-forceatlas2', () => ({
  default: { assign: vi.fn() },
}));

vi.mock('dagre', () => ({
  default: {
    graphlib: { Graph: vi.fn() },
    layout: vi.fn(),
  },
}));

// Spy functions to capture addNode/addEdge calls
const addNodeSpy = vi.fn();
const addEdgeSpy = vi.fn();
const hasNodeSpy = vi.fn(() => true);
const setNodeAttributeSpy = vi.fn();

vi.mock('graphology', () => {
  // Must use a regular function (not arrow) so it can be used with `new`
  function MockDirectedGraph(this: Record<string, unknown>) {
    this.addNode = addNodeSpy;
    this.addEdge = addEdgeSpy;
    this.hasNode = hasNodeSpy;
    this.setNodeAttribute = setNodeAttributeSpy;
    this.order = 3;
  }
  return { default: MockDirectedGraph };
});

// ── Typed references to mocked modules ─────────────────────────────
// vi.mock is hoisted before imports resolve, so these are the mock versions.

const fa2Mock = _forceAtlas2 as unknown as { assign: ReturnType<typeof vi.fn> };

const dagMock = _dagre as unknown as {
  graphlib: { Graph: ReturnType<typeof vi.fn> };
  layout: ReturnType<typeof vi.fn>;
};

const drawHoverMock = _drawHover as unknown as ReturnType<typeof vi.fn>;

// dagre graph instance — returned by new dagre.graphlib.Graph()
const mockDagreGraphInstance = {
  setGraph: vi.fn(),
  setDefaultEdgeLabel: vi.fn(),
  setNode: vi.fn(),
  setEdge: vi.fn(),
  nodes: vi.fn(() => ['n1', 'n2', 'n3']),
  node: vi.fn(() => ({ x: 100, y: 200 })),
};

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
    setNodeAttributeSpy.mockClear();
    fa2Mock.assign.mockClear();
    dagMock.layout.mockClear();
    dagMock.graphlib.Graph.mockClear().mockImplementation(function () {
      return mockDagreGraphInstance;
    });
    mockDagreGraphInstance.setGraph.mockClear();
    mockDagreGraphInstance.setDefaultEdgeLabel.mockClear();
    mockDagreGraphInstance.setNode.mockClear();
    mockDagreGraphInstance.setEdge.mockClear();
    mockDagreGraphInstance.nodes.mockClear();
    mockDagreGraphInstance.node.mockClear();
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

  // ── Layout prop ─────────────────────────────────────────────────

  it('uses forceatlas2 by default when no layout prop is given', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    await screen.findByTestId('sigma-container');
    expect(fa2Mock.assign).toHaveBeenCalled();
    expect(dagMock.layout).not.toHaveBeenCalled();
  });

  it('uses forceatlas2 when layout="forceatlas2" is explicit', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} layout="forceatlas2" />);
    await screen.findByTestId('sigma-container');
    expect(fa2Mock.assign).toHaveBeenCalled();
    expect(dagMock.layout).not.toHaveBeenCalled();
  });

  it('uses dagre when layout="dagre"', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} layout="dagre" />);
    await screen.findByTestId('sigma-container');
    expect(dagMock.layout).toHaveBeenCalled();
    expect(fa2Mock.assign).not.toHaveBeenCalled();
  });

  it('configures dagre graph with TB rankdir', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} layout="dagre" />);
    await screen.findByTestId('sigma-container');
    expect(mockDagreGraphInstance.setGraph).toHaveBeenCalledWith(
      expect.objectContaining({ rankdir: 'TB' })
    );
  });

  it('registers each node and edge with dagre', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} layout="dagre" />);
    await screen.findByTestId('sigma-container');
    expect(mockDagreGraphInstance.setNode).toHaveBeenCalledTimes(sampleNodes.length);
    expect(mockDagreGraphInstance.setEdge).toHaveBeenCalledTimes(sampleEdges.length);
  });

  it('applies dagre x/y positions to graphology nodes', async () => {
    mockWebGLSupport(true);
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} layout="dagre" />);
    await screen.findByTestId('sigma-container');
    expect(setNodeAttributeSpy).toHaveBeenCalledWith(expect.any(String), 'x', 100);
    expect(setNodeAttributeSpy).toHaveBeenCalledWith(expect.any(String), 'y', 200);
  });
});

describe('WebGLGraph theming', () => {
  let switchTheme: (theme: ThemeId) => void = () => {};
  function ThemeSwitcher() {
    switchTheme = useTheme().setTheme;
    return null;
  }

  beforeEach(() => {
    mockSetSettings.mockClear();
    drawHoverMock.mockClear();
    mockWebGLSupport(true);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--foreground');
    vi.restoreAllMocks();
  });

  it('draws labels in the theme foreground on a transparent canvas', async () => {
    document.documentElement.style.setProperty('--foreground', '210 40% 98%');
    render(<WebGLGraph nodes={sampleNodes} edges={sampleEdges} />);
    const container = await screen.findByTestId('sigma-container');

    expect(container.style.background).toBe('transparent');
    const settings = mockSetSettings.mock.lastCall![0];
    expect(settings.labelColor).toEqual({ color: 'hsl(210 40% 98%)' });

    // Sigma's hover box is white whatever the theme, so the hovered label stays black.
    const context = {} as CanvasRenderingContext2D;
    const node = { x: 0, y: 0, size: 6, label: 'Node 1', color: '#ff0000' };
    settings.hoverRenderer(context, node, { labelSize: 12, labelColor: settings.labelColor });
    expect(drawHoverMock).toHaveBeenCalledWith(
      context,
      node,
      expect.objectContaining({ labelSize: 12, labelColor: { color: '#000' } })
    );
  });

  it('reads the foreground again when the theme switches', async () => {
    render(
      <>
        <ThemeSwitcher />
        <WebGLGraph nodes={sampleNodes} edges={sampleEdges} />
      </>
    );
    await screen.findByTestId('sigma-container');
    act(() => {
      switchTheme('dark');
    });

    document.documentElement.style.setProperty('--foreground', '215 14% 17%');
    act(() => {
      switchTheme('github-light');
    });
    expect(mockSetSettings.mock.lastCall![0].labelColor).toEqual({ color: 'hsl(215 14% 17%)' });
  });
});
