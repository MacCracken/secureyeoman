// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoiceProfileManager } from './VoiceProfileManager';

vi.mock('../../api/client', () => ({
  fetchVoiceProfiles: vi.fn(),
  createVoiceProfile: vi.fn(),
  updateVoiceProfile: vi.fn(),
  deleteVoiceProfile: vi.fn(),
  previewVoiceProfile: vi.fn(),
  cloneVoice: vi.fn(),
  fetchMultimodalConfig: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchProfiles = vi.mocked(api.fetchVoiceProfiles);
const mockCreateProfile = vi.mocked(api.createVoiceProfile);
const mockDeleteProfile = vi.mocked(api.deleteVoiceProfile);
const mockFetchConfig = vi.mocked(api.fetchMultimodalConfig);

const SAMPLE_PROFILES: api.VoiceProfile[] = [
  {
    id: 'vp-1',
    name: 'Professional',
    provider: 'openai',
    voiceId: 'alloy',
    settings: {},
    createdAt: 1709500000000,
    updatedAt: 1709500000000,
  },
  {
    id: 'vp-2',
    name: 'Friendly',
    provider: 'elevenlabs',
    voiceId: 'rachel',
    settings: { stability: 0.5 },
    createdAt: 1709600000000,
    updatedAt: 1709600000000,
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <VoiceProfileManager />
    </QueryClientProvider>
  );
}

describe('VoiceProfileManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchConfig.mockResolvedValue({ enabled: true });
  });

  it('renders heading', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    expect(await screen.findByText('Voice Profiles')).toBeInTheDocument();
  });

  it('shows empty state when no profiles', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    expect(
      await screen.findByText('No voice profiles yet. Create one to get started.')
    ).toBeInTheDocument();
  });

  it('renders profile list', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    renderComponent();
    expect(await screen.findByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Friendly')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('elevenlabs')).toBeInTheDocument();
  });

  it('opens create form on button click', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Voice ID')).toBeInTheDocument();
  });

  it('submits create form', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    mockCreateProfile.mockResolvedValue({
      id: 'vp-new',
      name: 'Test',
      provider: 'openai',
      voiceId: 'echo',
      settings: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));

    const nameInput = screen.getByPlaceholderText('Profile name');
    fireEvent.change(nameInput, { target: { value: 'Test' } });

    const providerSelect = screen.getByDisplayValue('Select provider...');
    fireEvent.change(providerSelect, { target: { value: 'openai' } });

    const voiceIdInput = screen.getByPlaceholderText('Provider-specific voice identifier');
    fireEvent.change(voiceIdInput, { target: { value: 'echo' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalledWith({
        name: 'Test',
        provider: 'openai',
        voiceId: 'echo',
        settings: {},
      });
    });
  });

  it('shows validation error when fields are empty', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));
    fireEvent.click(screen.getByText('Create'));

    expect(
      await screen.findByText('Name, provider, and voice ID are required.')
    ).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    renderComponent();
    await screen.findByText('Professional');

    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(
      await screen.findByText('Delete "Professional"? This action cannot be undone.')
    ).toBeInTheDocument();
  });

  it('confirms deletion', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockDeleteProfile.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('Professional');

    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);

    await screen.findByText('Delete "Professional"? This action cannot be undone.');
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockDeleteProfile).toHaveBeenCalledWith('vp-1');
    });
  });

  it('shows Clone Voice button when elevenlabs is available', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    expect(await screen.findByText('Clone Voice')).toBeInTheDocument();
  });

  it('hides Clone Voice button when elevenlabs is not available', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai' });
    renderComponent();
    await screen.findByText('Voice Profiles');
    expect(screen.queryByText('Clone Voice')).not.toBeInTheDocument();
  });

  it('opens clone dialog on Clone Voice click', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));
    expect(screen.getByText('Upload an audio file or record from your microphone to clone a voice using ElevenLabs.')).toBeInTheDocument();
  });

  it('opens edit form with pre-filled data', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    renderComponent();
    await screen.findByText('Professional');

    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);

    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Professional')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alloy')).toBeInTheDocument();
  });
});
