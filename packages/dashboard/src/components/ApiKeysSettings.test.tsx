// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiKeysSettings } from './ApiKeysSettings';
import { createApiKey } from '../test/mocks';

vi.mock('../api/client', () => ({
  fetchApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchApiKeys = vi.mocked(api.fetchApiKeys);
const mockCreateApiKey = vi.mocked(api.createApiKey);
const mockRevokeApiKey = vi.mocked(api.revokeApiKey);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ApiKeysSettings />
    </QueryClientProvider>
  );
}

describe('ApiKeysSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the heading', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(await screen.findByText('API Keys')).toBeInTheDocument();
  });

  it('displays description', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(
      await screen.findByText('Manage API keys for programmatic access to SecureYeoman')
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockFetchApiKeys.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no keys', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(await screen.findByText('No API keys created yet.')).toBeInTheDocument();
  });

  it('displays API keys list', async () => {
    const keys = [
      createApiKey({ id: 'key-1', name: 'CI Pipeline', role: 'operator', prefix: 'fri_abc' }),
      createApiKey({ id: 'key-2', name: 'Monitoring', role: 'viewer', prefix: 'fri_def' }),
    ];
    mockFetchApiKeys.mockResolvedValue({ keys });
    renderComponent();
    expect(await screen.findByText('CI Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
  });

  it('displays role badges for each key', async () => {
    const keys = [createApiKey({ id: 'key-1', name: 'Test Key', role: 'admin' })];
    mockFetchApiKeys.mockResolvedValue({ keys });
    renderComponent();
    expect(await screen.findByText('admin')).toBeInTheDocument();
  });

  it('shows Create Key button', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    expect(await screen.findByText('Create Key')).toBeInTheDocument();
  });

  it('opens create form when Create Key clicked', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    const createButton = await screen.findByText('Create Key');
    fireEvent.click(createButton);
    expect(screen.getByPlaceholderText('e.g. CI Pipeline')).toBeInTheDocument();
  });

  it('can fill in the create form', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    renderComponent();
    fireEvent.click(screen.getByText('Create Key'));

    const nameInput = screen.getByPlaceholderText('e.g. CI Pipeline');
    fireEvent.change(nameInput, { target: { value: 'New Key' } });
    expect(nameInput).toHaveValue('New Key');
  });

  it('calls createApiKey when form is submitted', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    mockCreateApiKey.mockResolvedValue({
      id: 'new-key',
      name: 'New Key',
      role: 'viewer',
      prefix: 'fri_new',
      createdAt: new Date().toISOString(),
      rawKey: 'fri_xyz123456789',
    });
    renderComponent();

    fireEvent.click(screen.getByText('Create Key'));
    fireEvent.change(screen.getByPlaceholderText('e.g. CI Pipeline'), {
      target: { value: 'New Key' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'New Key',
        role: 'viewer',
        expiresInDays: 90,
      });
    });
  });

  it('shows created key banner with raw key', async () => {
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    mockCreateApiKey.mockResolvedValue({
      id: 'new-key',
      name: 'New Key',
      role: 'viewer',
      prefix: 'fri_new',
      createdAt: new Date().toISOString(),
      rawKey: 'fri_xyz123456789',
    });
    renderComponent();

    fireEvent.click(screen.getByText('Create Key'));
    fireEvent.change(screen.getByPlaceholderText('e.g. CI Pipeline'), {
      target: { value: 'New Key' },
    });
    fireEvent.click(screen.getByText('Create'));

    expect(
      await screen.findByText("API key created. Copy it now — it won't be shown again.")
    ).toBeInTheDocument();
  });

  it('shows revoke button for each key', async () => {
    const keys = [createApiKey({ id: 'key-1', name: 'Test Key', role: 'viewer' })];
    mockFetchApiKeys.mockResolvedValue({ keys });
    renderComponent();

    const revokeButton = await screen.findByLabelText('Revoke API key Test Key');
    expect(revokeButton).toBeInTheDocument();
  });

  it('opens confirmation dialog when revoke clicked', async () => {
    const keys = [createApiKey({ id: 'key-1', name: 'Test Key', role: 'viewer' })];
    mockFetchApiKeys.mockResolvedValue({ keys });
    renderComponent();

    const revokeButton = await screen.findByLabelText('Revoke API key Test Key');
    fireEvent.click(revokeButton);

    expect(screen.getByText('Revoke API Key')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to revoke/)).toBeInTheDocument();
  });

  it('calls revokeApiKey when confirm is clicked', async () => {
    const keys = [createApiKey({ id: 'key-1', name: 'Test Key', role: 'viewer' })];
    mockFetchApiKeys.mockResolvedValue({ keys });
    mockRevokeApiKey.mockResolvedValue(undefined);
    renderComponent();

    const revokeButton = await screen.findByLabelText('Revoke API key Test Key');
    fireEvent.click(revokeButton);
    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1');
    });
  });

  it('closes dialog when cancel is clicked', async () => {
    const keys = [createApiKey({ id: 'key-1', name: 'Test Key', role: 'viewer' })];
    mockFetchApiKeys.mockResolvedValue({ keys });
    renderComponent();

    const revokeButton = await screen.findByLabelText('Revoke API key Test Key');
    fireEvent.click(revokeButton);
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Revoke API Key')).not.toBeInTheDocument();
  });
});
