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
  {
    id: '1',
    name: 'index.ts',
    path: '/tmp/index.ts',
    content: '',
    language: 'typescript',
    isDirty: false,
  },
  {
    id: '2',
    name: 'app.tsx',
    path: '/tmp/app.tsx',
    content: 'code',
    language: 'typescript',
    isDirty: true,
  },
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

  it('calls onTabClose when X button clicked on a tab', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    // There are two close buttons (one per tab)
    const _closeBtns = screen
      .getAllByRole('button')
      .filter(
        (btn) =>
          btn.querySelector('.w-3.h-3') !== null || btn.classList.contains('hover:text-destructive')
      );
    // Click the close button next to app.tsx (second tab)
    const appTab = screen.getByText('app.tsx').closest('div')!;
    const closeBtn = appTab.querySelector('button.hover\\:text-destructive')!;
    if (closeBtn) {
      await user.click(closeBtn);
      expect(props.onTabClose).toHaveBeenCalledWith('2');
    }
  });

  it('calls onToggleSettings when settings button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const settingsBtn = screen.getByTitle('Editor settings');
    await user.click(settingsBtn);
    expect(props.onToggleSettings).toHaveBeenCalled();
  });

  it('calls onToggleSplitView when split button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const splitBtn = screen.getByTitle('Toggle split view');
    await user.click(splitBtn);
    expect(props.onToggleSplitView).toHaveBeenCalled();
  });

  it('calls onSendToChat when send-to-chat button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const sendBtn = screen.getByTitle('Send selected text (or all) to chat');
    await user.click(sendBtn);
    expect(props.onSendToChat).toHaveBeenCalled();
  });

  it('highlights settings button when settingsOpen is true', () => {
    renderToolbar({ settingsOpen: true });
    const btn = screen.getByTitle('Editor settings');
    expect(btn.className).toContain('bg-primary/10');
  });

  it('highlights split button when splitView is true', () => {
    renderToolbar({ splitView: true });
    const btn = screen.getByTitle('Toggle split view');
    expect(btn.className).toContain('bg-primary/10');
  });

  it('highlights chat button when showChat is true', () => {
    renderToolbar({ showChat: true });
    const btn = screen.getByTitle(/chat panel/i);
    expect(btn.className).toContain('bg-primary/15');
  });

  it('highlights world button when showWorld is true', () => {
    renderToolbar({ showWorld: true });
    const btn = screen.getByTitle(/agent world/i);
    expect(btn.className).toContain('bg-primary/15');
  });

  it('highlights memory button when memoryEnabled is true', () => {
    renderToolbar({ memoryEnabled: true });
    const btn = screen.getByTitle(/Memory on/i);
    expect(btn.className).toContain('bg-primary/15');
  });

  it('shows memory-off title when memoryEnabled is false', () => {
    renderToolbar({ memoryEnabled: false });
    expect(screen.getByTitle('Memory off')).toBeInTheDocument();
  });

  it('disables run button when runDisabled is true', () => {
    renderToolbar({ runDisabled: true });
    const runBtn = screen.getByTitle('Run code in terminal (Ctrl+Enter)');
    expect(runBtn).toBeDisabled();
  });

  it('calls onToggleWorld when world button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const worldBtn = screen.getByTitle(/agent world/i);
    await user.click(worldBtn);
    expect(props.onToggleWorld).toHaveBeenCalled();
  });

  it('shows model name from modelInfo', () => {
    renderToolbar({ modelInfo: { current: { model: 'claude-3' } } });
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows "Model" when modelInfo is undefined', () => {
    renderToolbar({ modelInfo: undefined });
    expect(screen.getByText('Model')).toBeInTheDocument();
  });

  it('opens model widget on model button click', async () => {
    const user = userEvent.setup();
    renderToolbar();
    const modelBtn = screen.getByTitle('Switch model');
    await user.click(modelBtn);
    expect(screen.getByTestId('model-widget')).toBeInTheDocument();
  });

  it('shows rename input when renamingTabId matches', () => {
    renderToolbar({ renamingTabId: '1', renameValue: 'new-name.ts' });
    const input = screen.getByDisplayValue('new-name.ts');
    expect(input).toBeInTheDocument();
  });

  it('calls onTabRenameStart on double-click of tab name', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    const tabName = screen.getByText('index.ts');
    await user.dblClick(tabName);
    expect(props.onTabRenameStart).toHaveBeenCalledWith('1', 'index.ts');
  });

  it('calls onTabRenameConfirm on Enter in rename input', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ renamingTabId: '1', renameValue: 'new.ts' });
    const input = screen.getByDisplayValue('new.ts');
    await user.type(input, '{Enter}');
    expect(props.onTabRenameConfirm).toHaveBeenCalled();
  });

  it('calls onTabRenameCancel on Escape in rename input', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ renamingTabId: '1', renameValue: 'new.ts' });
    const input = screen.getByDisplayValue('new.ts');
    await user.type(input, '{Escape}');
    expect(props.onTabRenameCancel).toHaveBeenCalled();
  });

  it('calls onTabRenameChange when typing in rename input', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ renamingTabId: '1', renameValue: '' });
    const input = screen.getByRole('textbox');
    await user.type(input, 'x');
    expect(props.onTabRenameChange).toHaveBeenCalled();
  });

  it('does not show git button when showGitButton is false', () => {
    renderToolbar({ showGitButton: false });
    expect(screen.queryByTitle('Toggle Git panel')).not.toBeInTheDocument();
  });

  it('shows keybindings button when onToggleKeybindings is provided', async () => {
    const onToggleKeybindings = vi.fn();
    const user = userEvent.setup();
    const { _props } = renderToolbar({ onToggleKeybindings });
    const btn = screen.getByTestId('keybindings-btn');
    await user.click(btn);
    expect(onToggleKeybindings).toHaveBeenCalled();
  });

  it('does not show keybindings button when handler is not provided', () => {
    renderToolbar({ onToggleKeybindings: undefined });
    expect(screen.queryByTestId('keybindings-btn')).not.toBeInTheDocument();
  });

  it('shows active tab with primary styling', () => {
    renderToolbar({ activeTabId: '1' });
    const tab = screen.getByText('index.ts').closest('div');
    expect(tab?.className).toContain('bg-primary/10');
  });

  it('shows inactive tab without primary styling', () => {
    renderToolbar({ activeTabId: '1' });
    const tab = screen.getByText('app.tsx').closest('div');
    expect(tab?.className).toContain('hover:bg-muted/50');
  });
});
