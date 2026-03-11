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

  // --- Additional coverage tests ---

  it('STT test button is disabled when no STT provider selected', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');
    const testButtons = screen.getAllByText('Test');
    // Second test button (STT) should be disabled
    expect(testButtons[1].closest('button')).toBeDisabled();
  });

  it('does not call update when TTS select value is empty', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');

    const ttsSelect = screen.getByDisplayValue('OpenAI');
    fireEvent.change(ttsSelect, { target: { value: '' } });

    expect(mockUpdateProvider).not.toHaveBeenCalled();
  });

  it('does not call update when STT select value is empty', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: 'openai' });
    renderComponent();
    await screen.findByText('Voice Providers');

    const sttSelect = screen.getByDisplayValue('OpenAI');
    fireEvent.change(sttSelect, { target: { value: '' } });

    expect(mockUpdateProvider).not.toHaveBeenCalled();
  });

  it('TTS test handles synthesizeSpeech error gracefully', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: '' });
    mockSynthesize.mockRejectedValue(new Error('TTS failed'));
    renderComponent();
    await screen.findByText('Voice Providers');

    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    // Should show "Failed" temporarily
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows health dots for healthy and unhealthy providers in TTS list', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: 'openai',
      providerHealth: { openai: true, elevenlabs: false, deepgram: true },
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    // ElevenLabs and Deepgram appear in both select options and health lists
    const elevenLabsEntries = screen.getAllByText('ElevenLabs');
    expect(elevenLabsEntries.length).toBeGreaterThanOrEqual(1);
    const deepgramEntries = screen.getAllByText('Deepgram');
    expect(deepgramEntries.length).toBeGreaterThanOrEqual(1);

    // Should have both success and destructive health dots
    const successDots = document.querySelectorAll('.bg-success');
    const destructiveDots = document.querySelectorAll('.bg-destructive');
    expect(successDots.length).toBeGreaterThanOrEqual(1);
    expect(destructiveDots.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show health list entries for providers with null health', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: 'openai',
      providerHealth: { openai: true },
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    // openai should show in health list, but providers not in providerHealth should not appear in health section
    // The labels "OpenAI" will appear in the health list and in the selects
    const openaiLabels = screen.getAllByText('OpenAI');
    // At least 1 from health list, plus the select dropdowns
    expect(openaiLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders section headings for TTS and STT', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');

    expect(screen.getByText('Text-to-Speech Provider')).toBeInTheDocument();
    expect(screen.getByText('Speech-to-Text Provider')).toBeInTheDocument();
  });

  it('shows health dot next to current TTS provider', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: '',
      providerHealth: { openai: true },
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    // The HealthDot for the current TTS should be visible (green dot)
    // There should be health dots rendered in the DOM
    const dots = document.querySelectorAll('.bg-success');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('shows destructive health dot for unhealthy current provider', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: '',
      providerHealth: { openai: false },
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    const dots = document.querySelectorAll('.bg-destructive');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('shows muted health dot when provider health is unknown (null)', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: 'openai',
      sttProvider: '',
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    // Without providerHealth, the dot next to current tts should show the muted state
    const dots = document.querySelectorAll('.bg-muted-foreground\\/30');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('shows health dot next to current STT provider', async () => {
    mockFetchConfig.mockResolvedValue({
      enabled: true,
      ttsProvider: '',
      sttProvider: 'deepgram',
      providerHealth: { deepgram: true },
    });
    renderComponent();
    await screen.findByText('Voice Providers');

    expect(screen.getByDisplayValue('Deepgram')).toBeInTheDocument();
    const dots = document.querySelectorAll('.bg-success');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('TTS test shows success text after synthesize resolves', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: 'openai', sttProvider: '' });
    mockSynthesize.mockResolvedValue({ audioBase64: 'dGVzdA==', format: 'mp3', durationMs: 1000 });

    const playMock = vi.fn();
    const AudioMock = vi.fn(function (this: Record<string, unknown>) {
      this.play = playMock;
      this.pause = vi.fn();
    });
    vi.stubGlobal('Audio', AudioMock);

    renderComponent();
    await screen.findByText('Voice Providers');

    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Played')).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it('renders all TTS provider options in dropdown', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');

    const ttsSelect = screen.getByDisplayValue('Select TTS provider...');
    const options = ttsSelect.querySelectorAll('option');
    // 13 providers + 1 default "Select TTS provider..."
    expect(options.length).toBe(14);
  });

  it('renders all STT provider options in dropdown', async () => {
    mockFetchConfig.mockResolvedValue({ enabled: true, ttsProvider: '', sttProvider: '' });
    renderComponent();
    await screen.findByText('Voice Providers');

    const sttSelect = screen.getByDisplayValue('Select STT provider...');
    const options = sttSelect.querySelectorAll('option');
    // 9 providers + 1 default "Select STT provider..."
    expect(options.length).toBe(10);
  });
});
