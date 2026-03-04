// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditorToolbar } from './EditorToolbar';

vi.mock('../ModelWidget', () => ({
  ModelWidget: () => <div data-testid="model-widget">ModelWidget</div>,
}));

const tabs = [
  { id: '1', name: 'index.ts', path: '/tmp/index.ts', content: '', language: 'typescript', isDirty: false },
  { id: '2', name: 'app.tsx', path: '/tmp/app.tsx', content: 'code', language: 'typescript', isDirty: true },
];

function createProps(overrides = {}) {
  return {
    tabs,
    activeTabId: '1',
    language: 'typescript',
    showExplorer: false,
    showChat: false,
    showWorld: false,
    settingsOpen: false,
    splitView: false,
    memoryEnabled: true,
    modelInfo: { current: { model: 'gpt-4' } },
    runDisabled: false,
    renamingTabId: null,
    renameValue: '',
    onToggleExplorer: vi.fn(),
    onToggleChat: vi.fn(),
    onToggleWorld: vi.fn(),
    onToggleSettings: vi.fn(),
    onToggleSplitView: vi.fn(),
    onToggleMemory: vi.fn(),
    onTabClick: vi.fn(),
    onTabClose: vi.fn(),
    onTabRenameStart: vi.fn(),
    onTabRenameChange: vi.fn(),
    onTabRenameConfirm: vi.fn(),
    onTabRenameCancel: vi.fn(),
    onNewTab: vi.fn(),
    onRun: vi.fn(),
    onSendToChat: vi.fn(),
    onCommandPalette: vi.fn(),
    showGitButton: true,
    onToggleGit: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(overrides = {}) {
  const props = createProps(overrides);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <EditorToolbar {...props} />
      </QueryClientProvider>
    ),
    props,
  };
}

describe('EditorToolbar', () => {
  it('renders tab names', () => {
    renderToolbar();
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('app.tsx')).toBeInTheDocument();
  });

  it('shows dirty indicator', () => {
    renderToolbar();
    // The dirty tab (app.tsx) should have a ● indicator
    expect(screen.getByText('●')).toBeInTheDocument();
  });

  it('calls onTabClick when tab clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.click(screen.getByText('app.tsx'));
    expect(props.onTabClick).toHaveBeenCalledWith('2');
  });

  it('calls onRun when run button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const runBtn = screen.getByTitle('Run code in terminal (Ctrl+Enter)');
    await user.click(runBtn);
    expect(props.onRun).toHaveBeenCalled();
  });

  it('calls onCommandPalette when search button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const searchBtn = screen.getByTitle('Command Palette (Ctrl+K)');
    await user.click(searchBtn);
    expect(props.onCommandPalette).toHaveBeenCalled();
  });

  it('calls onToggleExplorer when folder button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const explorerBtn = screen.getByTitle('Toggle file explorer');
    await user.click(explorerBtn);
    expect(props.onToggleExplorer).toHaveBeenCalled();
  });

  it('calls onToggleChat when chat button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const chatBtn = screen.getByTitle(/chat panel/i);
    await user.click(chatBtn);
    expect(props.onToggleChat).toHaveBeenCalled();
  });

  it('calls onToggleGit when git button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const gitBtn = screen.getByTitle('Toggle Git panel');
    await user.click(gitBtn);
    expect(props.onToggleGit).toHaveBeenCalled();
  });

  it('shows language badge', () => {
    renderToolbar();
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('highlights active explorer button', () => {
    renderToolbar({ showExplorer: true });
    const btn = screen.getByTitle('Toggle file explorer');
    expect(btn.className).toContain('bg-primary/10');
  });

  it('calls onToggleMemory', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const memBtn = screen.getByTitle(/Memory on/i);
    await user.click(memBtn);
    expect(props.onToggleMemory).toHaveBeenCalled();
  });

  it('calls onNewTab when + button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const newBtn = screen.getByTitle('New file');
    await user.click(newBtn);
    expect(props.onNewTab).toHaveBeenCalled();
  });
});
