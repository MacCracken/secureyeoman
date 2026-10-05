import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EditorWidget } from './EditorWidget';
import { useTheme, type ThemeId } from '../../../hooks/useTheme';

const { mockLoaderConfig } = vi.hoisted(() => ({ mockLoaderConfig: vi.fn() }));
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="monaco-editor" data-theme={String(props.theme)} />
  ),
  loader: { config: mockLoaderConfig },
}));

describe('EditorWidget', () => {
  let switchTheme: (theme: ThemeId) => void = () => {};
  function ThemeSwitcher() {
    switchTheme = useTheme().setTheme;
    return null;
  }

  it('loads Monaco from the bundled copy, not the CDN', () => {
    expect(mockLoaderConfig).toHaveBeenCalledWith({ paths: { vs: '/vs' } });
  });

  it.each([
    ['dark', 'vs-dark'],
    ['nord', 'vs-dark'],
    ['dracula', 'vs-dark'],
    ['light', 'vs'],
    ['github-light', 'vs'],
  ] as const)('gives Monaco the %s theme as %s', (theme, monacoTheme) => {
    render(
      <>
        <ThemeSwitcher />
        <EditorWidget />
      </>
    );
    act(() => {
      switchTheme(theme);
    });
    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-theme', monacoTheme);
  });
});
