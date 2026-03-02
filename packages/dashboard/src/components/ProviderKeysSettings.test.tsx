// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProviderKeysSettings } from './ProviderKeysSettings';

vi.mock('../api/client', () => ({
  fetchSecretKeys: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSecretKeys = vi.mocked(api.fetchSecretKeys);
const mockSetSecret = vi.mocked(api.setSecret);
const mockDeleteSecret = vi.mocked(api.deleteSecret);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProviderKeysSettings />
    </QueryClientProvider>
  );
}

describe('ProviderKeysSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders heading and description', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(await screen.findByText('AI Provider Keys')).toBeInTheDocument();
    expect(screen.getByText(/Configure API keys for AI model providers/)).toBeInTheDocument();
  });

  it('shows the provider dropdown', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(await screen.findByText('Select a provider...')).toBeInTheDocument();
  });

  it('does not show provider list when none are configured', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('AI Provider Keys');
    // The summary list should not render any provider rows
    expect(screen.queryByText('Configured')).not.toBeInTheDocument();
  });

  it('shows configured providers list when at least one is configured', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY'] });
    renderComponent();
    // Wait for the configured count to appear (data loaded)
    expect(await screen.findByText('1 of 7 providers configured')).toBeInTheDocument();
    // The summary list should show the configured provider
    expect(screen.getByText('ANTHROPIC_API_KEY')).toBeInTheDocument();
  });

  it('marks configured providers in dropdown', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY'] });
    renderComponent();
    // Wait for data to load
    await screen.findByText('1 of 7 providers configured');
    const select = screen.getByDisplayValue('Select a provider...');
    const options = Array.from(select.querySelectorAll('option'));
    const anthropicOption = options.find((o) => o.textContent?.includes('Anthropic'));
    expect(anthropicOption?.textContent).toContain('(configured)');
  });

  it('shows configured count summary', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] });
    renderComponent();
    expect(await screen.findByText('2 of 7 providers configured')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockFetchSecretKeys.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows help steps when selecting an unconfigured provider', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'openai' } });

    expect(screen.getByText('How to get your API key')).toBeInTheDocument();
    expect(screen.getByText(/Go to platform.openai.com/)).toBeInTheDocument();
    expect(screen.getByText('Open OpenAI console')).toBeInTheDocument();
  });

  it('does not show help steps when selecting a configured provider', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['OPENAI_API_KEY'] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'openai' } });

    expect(screen.queryByText('How to get your API key')).not.toBeInTheDocument();
    // The "Configured" badge in the detail panel header
    const badges = screen.getAllByText('Configured');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows description and docs link for selected provider', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'openai' } });

    expect(screen.getByText(/GPT-4o, GPT-4/)).toBeInTheDocument();
    expect(screen.getByText('API docs')).toBeInTheDocument();
  });

  it('shows custom env var input when Custom is selected', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'custom' } });

    expect(screen.getByPlaceholderText('MY_PROVIDER_API_KEY')).toBeInTheDocument();
  });

  it('calls setSecret with correct env var name on save', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    mockSetSecret.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    const keyInput = screen.getByPlaceholderText('sk-ant-...');
    fireEvent.change(keyInput, { target: { value: 'sk-ant-1234567890abcdef' } });

    fireEvent.click(screen.getByText('Save Key'));

    await waitFor(() => {
      expect(mockSetSecret).toHaveBeenCalledWith('ANTHROPIC_API_KEY', 'sk-ant-1234567890abcdef');
    });
  });

  it('resets dropdown and shows configured list after saving', async () => {
    mockFetchSecretKeys
      .mockResolvedValueOnce({ keys: [] })
      .mockResolvedValueOnce({ keys: ['ANTHROPIC_API_KEY'] });
    mockSetSecret.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    const keyInput = screen.getByPlaceholderText('sk-ant-...');
    fireEvent.change(keyInput, { target: { value: 'sk-ant-1234567890abcdef' } });

    fireEvent.click(screen.getByText('Save Key'));

    // After save, dropdown should reset and configured provider list should appear
    await waitFor(() => {
      expect(screen.getByDisplayValue('Select a provider...')).toBeInTheDocument();
    });
    // Detail panel should be gone
    expect(screen.queryByText('How to get your API key')).not.toBeInTheDocument();
  });

  it('shows "Replace Key" for already-configured provider', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY'] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    expect(screen.getByText('Replace Key')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('shows validation error when key is too short', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'openai' } });

    const keyInput = screen.getByPlaceholderText('sk-...');
    fireEvent.change(keyInput, { target: { value: 'short' } });

    expect(screen.getByText('Key must be at least 8 characters')).toBeInTheDocument();
  });

  it('shows confirmation dialog on delete', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY'] });
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    fireEvent.click(screen.getByLabelText('Delete Anthropic key'));

    expect(screen.getByText('Delete Provider Key')).toBeInTheDocument();
    expect(screen.getByText(/Delete the API key for Anthropic/)).toBeInTheDocument();
  });

  it('calls deleteSecret on confirm', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['ANTHROPIC_API_KEY'] });
    mockDeleteSecret.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('AI Provider Keys');

    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    fireEvent.click(screen.getByLabelText('Delete Anthropic key'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockDeleteSecret).toHaveBeenCalledWith('ANTHROPIC_API_KEY');
    });
  });

  it('can click a configured provider row to select it', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: ['GROQ_API_KEY'] });
    renderComponent();
    // Wait for data to load
    await screen.findByText('1 of 7 providers configured');

    // Click the Groq row in the configured summary list
    fireEvent.click(screen.getByText('Groq'));

    // Should now show the Groq detail panel with Replace Key (since configured)
    expect(screen.getByText(/Fast inference for open models/)).toBeInTheDocument();
    expect(screen.getByText('Replace Key')).toBeInTheDocument();
  });

  it('cancel button resets dropdown and closes detail panel', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('0 of 7 providers configured');

    // Select a provider
    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    // Detail panel is showing
    expect(screen.getByText('How to get your API key')).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Detail panel should be gone and dropdown reset
    expect(screen.queryByText('How to get your API key')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Select a provider...')).toBeInTheDocument();
  });

  it('can exit provider edit by resetting dropdown without entering a key', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    await screen.findByText('0 of 7 providers configured');

    // Select a provider
    const select = screen.getByDisplayValue('Select a provider...');
    fireEvent.change(select, { target: { value: 'anthropic' } });

    // Detail panel is showing
    expect(screen.getByText('How to get your API key')).toBeInTheDocument();

    // Reset dropdown to deselect — user exits without entering a key
    fireEvent.change(select, { target: { value: '' } });

    // Detail panel should be gone
    expect(screen.queryByText('How to get your API key')).not.toBeInTheDocument();
    expect(screen.queryByText('Save Key')).not.toBeInTheDocument();
  });
});
