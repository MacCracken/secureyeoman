// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoiceProviderPicker } from './VoiceProviderPicker';

vi.mock('../../api/client', () => ({
  fetchMultimodalConfig: vi.fn(),
  updateMultimodalProvider: vi.fn(),
  synthesizeSpeech: vi.fn(),
  transcribeAudio: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchConfig = vi.mocked(api.fetchMultimodalConfig);
const mockUpdateProvider = vi.mocked(api.updateMultimodalProvider);
const mockSynthesize = vi.mocked(api.synthesizeSpeech);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <VoiceProviderPicker />
    </QueryClientProvider>
  );
}

describe('VoiceProviderPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders heading and description', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    renderComponent();
    expect(await screen.findByText('Voice Providers')).toBeInTheDocument();
    expect(
      screen.getByText(/Configure text-to-speech and speech-to-text providers/)
    ).toBeInTheDocument();
  });

  it('shows TTS and STT dropdowns', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true });
    renderComponent();
    expect(await screen.findByText('Select TTS provider...')).toBeInTheDocument();
    expect(screen.getByText('Select STT provider...')).toBeInTheDocument();
  });

  it('renders current TTS provider selection', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: 'deepgram' });
    renderComponent();
    await screen.findByText('Voice Providers');
    const ttsSelect = screen.getByDisplayValue('OpenAI');
    expect(ttsSelect).toBeInTheDocument();
    const sttSelect = screen.getByDisplayValue('Deepgram');
    expect(sttSelect).toBeInTheDocument();
  });

  it('calls updateMultimodalProvider on TTS selection change', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    mockUpdateProvider.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('Voice Providers');

    const ttsSelect = screen.getByDisplayValue('Select TTS provider...');
    fireEvent.change(ttsSelect, { target: { value: 'elevenlabs' } });

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('tts', 'elevenlabs');
    });
  });

  it('calls updateMultimodalProvider on STT selection change', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    mockUpdateProvider.mockResolvedValue(undefined);
    renderComponent();
    await screen.findByText('Voice Providers');

    const sttSelect = screen.getByDisplayValue('Select STT provider...');
    fireEvent.change(sttSelect, { target: { value: 'assemblyai' } });

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('stt', 'assemblyai');
    });
  });

  it('TTS test button is disabled when no provider selected', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');
    const testButtons = screen.getAllByText('Test');
    // First test button (TTS) should be disabled
    expect(testButtons[0].closest('button')).toBeDisabled();
  });

  it('TTS test button calls synthesizeSpeech', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: '' });
    mockSynthesize.mockResolvedValue({ audioBase64: 'dGVzdA==', format: 'mp3', durationMs: 1000 });

    // Mock Audio constructor
    const playMock = vi.fn();
    vi.stubGlobal(
      'Audio',
      vi.fn(() => ({ play: playMock, pause: vi.fn() }))
    );

    renderComponent();
    await screen.findByText('Voice Providers');

    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(mockSynthesize).toHaveBeenCalledWith({ text: 'Hello, this is a test' });
    });

    vi.unstubAllGlobals();
  });

  it('shows loading state', () => {
    mockFetchConfig.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading voice configuration...')).toBeInTheDocument();
  });

  it('shows health indicators when providerHealth is present', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: 'openai',
      providerHealth: { openai: true, elevenlabs: false },
    });
    renderComponent();
    await screen.findByText('Voice Providers');
    // Should show provider health entries
    const labels = screen.getAllByText('OpenAI');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});
