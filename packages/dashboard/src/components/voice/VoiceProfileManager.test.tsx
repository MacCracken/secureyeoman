// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockUpdateProfile = vi.mocked(api.updateVoiceProfile);
const mockDeleteProfile = vi.mocked(api.deleteVoiceProfile);
const mockPreviewProfile = vi.mocked(api.previewVoiceProfile);
const mockCloneVoice = vi.mocked(api.cloneVoice);
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
    expect(
      screen.getByText(
        'Upload an audio file or record from your microphone to clone a voice using ElevenLabs.'
      )
    ).toBeInTheDocument();
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

  // --- Additional coverage tests ---

  it('shows loading state while fetching profiles', () => {
    mockFetchProfiles.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading profiles...')).toBeInTheDocument();
  });

  it('shows Clone Voice button when a profile has elevenlabs provider (no config match)', async () => {
    // elevenlabsAvailable is true if any profile has provider=elevenlabs, even if config ttsProvider is different
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai' });
    renderComponent();
    expect(await screen.findByText('Clone Voice')).toBeInTheDocument();
  });

  it('closes create form via Cancel button', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));
    expect(screen.getByText('Create Profile', { selector: 'h3' })).toBeInTheDocument();

    // Click Cancel inside the form
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Profile name')).not.toBeInTheDocument();
  });

  it('closes create form via X button', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));
    expect(screen.getByPlaceholderText('Profile name')).toBeInTheDocument();

    // The X button is a sibling of the form title
    const formHeading = screen.getByText('Create Profile', { selector: 'h3' });
    const closeBtn = formHeading.parentElement!.querySelector('button')!;
    fireEvent.click(closeBtn);
    expect(screen.queryByPlaceholderText('Profile name')).not.toBeInTheDocument();
  });

  it('shows JSON validation error for invalid settings', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByDisplayValue('Select provider...'), {
      target: { value: 'openai' },
    });
    fireEvent.change(screen.getByPlaceholderText('Provider-specific voice identifier'), {
      target: { value: 'echo' },
    });

    // Set invalid JSON in the settings textarea
    const settingsTextarea = screen.getByPlaceholderText('{"speed": 1.0, "pitch": 0}');
    fireEvent.change(settingsTextarea, { target: { value: '{invalid json' } });

    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText('Settings must be valid JSON.')).toBeInTheDocument();
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });

  it('submits edit form and calls updateVoiceProfile', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockUpdateProfile.mockResolvedValue({
      ...SAMPLE_PROFILES[0],
      name: 'Updated Name',
    });
    renderComponent();
    await screen.findByText('Professional');

    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);

    expect(screen.getByText('Edit Profile')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Professional');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('vp-1', {
        name: 'Updated Name',
        provider: 'openai',
        voiceId: 'alloy',
        settings: {},
      });
    });
  });

  it('shows error message when create mutation fails', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    mockCreateProfile.mockRejectedValue(new Error('Network error'));
    renderComponent();
    await screen.findByText('Voice Profiles');

    fireEvent.click(screen.getByText('Create Profile'));

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByDisplayValue('Select provider...'), {
      target: { value: 'openai' },
    });
    fireEvent.change(screen.getByPlaceholderText('Provider-specific voice identifier'), {
      target: { value: 'echo' },
    });

    fireEvent.click(screen.getByText('Create'));

    expect(await screen.findByText('Failed to create profile.')).toBeInTheDocument();
  });

  it('shows error message when update mutation fails', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockUpdateProfile.mockRejectedValue(new Error('Network error'));
    renderComponent();
    await screen.findByText('Professional');

    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);

    fireEvent.click(screen.getByText('Update'));

    expect(await screen.findByText('Failed to update profile.')).toBeInTheDocument();
  });

  it('previews a voice profile', async () => {
    const playMock = vi.fn();
    const AudioMock = vi.fn(function (this: Record<string, unknown>) {
      this.play = playMock;
      this.pause = vi.fn();
      this.onended = null;
    });
    vi.stubGlobal('Audio', AudioMock);

    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockPreviewProfile.mockResolvedValue({
      audioBase64: 'dGVzdA==',
      format: 'mp3',
      durationMs: 1000,
    });
    renderComponent();
    await screen.findByText('Professional');

    const previewButtons = screen.getAllByTitle('Preview');
    fireEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(mockPreviewProfile).toHaveBeenCalledWith(
        'vp-1',
        'Hello, this is a voice profile preview.'
      );
    });

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
  });

  it('handles preview error gracefully', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockPreviewProfile.mockRejectedValue(new Error('Preview failed'));
    renderComponent();
    await screen.findByText('Professional');

    const previewButtons = screen.getAllByTitle('Preview');
    fireEvent.click(previewButtons[0]);

    // Should not throw, preview button should become clickable again
    await waitFor(() => {
      expect(mockPreviewProfile).toHaveBeenCalled();
    });
  });

  it('closes clone dialog via Cancel button', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes clone dialog via backdrop click', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Click the backdrop (the dialog overlay itself)
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clone submit button is disabled when name or audio is missing', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));

    // Clone button should be disabled (no name, no audio)
    const cloneBtn = screen.getByText('Clone');
    expect(cloneBtn.closest('button')).toBeDisabled();
  });

  it('clone submit does nothing when name is empty', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));

    // Try to submit without filling anything
    const cloneBtn = screen.getByText('Clone');
    fireEvent.click(cloneBtn);

    expect(mockCloneVoice).not.toHaveBeenCalled();
  });

  it('displays profile voice ID and formatted date', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    renderComponent();
    await screen.findByText('Professional');

    // Check voice ID display - they are in the same text node with created date
    const voiceInfoElements = screen.getAllByText(/Voice:.*alloy/);
    expect(voiceInfoElements.length).toBeGreaterThanOrEqual(1);
    const voiceInfoElements2 = screen.getAllByText(/Voice:.*rachel/);
    expect(voiceInfoElements2.length).toBeGreaterThanOrEqual(1);
    // Check date formatting
    const createdElements = screen.getAllByText(/Created:/);
    expect(createdElements.length).toBeGreaterThanOrEqual(1);
  });

  it('edit form shows settings JSON with profile data', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    renderComponent();
    await screen.findByText('Friendly');

    const editButtons = screen.getAllByTitle('Edit');
    // Click edit on the second profile which has settings
    fireEvent.click(editButtons[1]);

    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Friendly')).toBeInTheDocument();
    expect(screen.getByDisplayValue('rachel')).toBeInTheDocument();
    // Settings JSON should be formatted
    const textarea = screen.getByDisplayValue(/stability/);
    expect(textarea).toBeInTheDocument();
  });

  it('clone name input can be typed into', async () => {
    const user = userEvent.setup();
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    await user.click(screen.getByText('Clone Voice'));

    const nameInput = screen.getByPlaceholderText('My cloned voice');
    await user.type(nameInput, 'My Voice');
    expect(nameInput).toHaveValue('My Voice');
  });

  it('preview uses default format when result.format is empty', async () => {
    const playMock = vi.fn();
    const AudioMock = vi.fn(function (this: Record<string, unknown>) {
      this.play = playMock;
      this.pause = vi.fn();
      this.onended = null;
    });
    vi.stubGlobal('Audio', AudioMock);

    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockPreviewProfile.mockResolvedValue({
      audioBase64: 'dGVzdA==',
      format: '',
      durationMs: 500,
    });
    renderComponent();
    await screen.findByText('Professional');

    const previewButtons = screen.getAllByTitle('Preview');
    fireEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
  });

  it('description text is rendered', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: [] });
    renderComponent();
    await screen.findByText('Voice Profiles');
    expect(
      screen.getByText('Create and manage voice profiles for text-to-speech output.')
    ).toBeInTheDocument();
  });

  it('clone dialog shows Profile Name label and Audio Source label', async () => {
    mockFetchProfiles.mockResolvedValue({ profiles: SAMPLE_PROFILES });
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'elevenlabs' });
    renderComponent();
    await screen.findByText('Clone Voice');

    fireEvent.click(screen.getByText('Clone Voice'));

    expect(screen.getByText('Profile Name')).toBeInTheDocument();
    expect(screen.getByText('Audio Source')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });
});
