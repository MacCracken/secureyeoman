/**
 * Tests for VoiceAgentSession — the full-duplex voice conversation pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceAgentSession, type VoiceAgentConfig } from './voice-agent.js';

// ─── Mock MultimodalManager ──────────────────────────────────────────

function createMockManager(overrides?: {
  transcribeResult?: { text: string; language?: string; durationMs?: number };
  synthesizeResult?: { buffer: Buffer; format: string; durationMs: number };
  chatResult?: { content: string };
}) {
  const defaults = {
    transcribeResult: { text: 'hello world', language: 'en', durationMs: 120 },
    synthesizeResult: { buffer: Buffer.from('fake-audio-data'), format: 'mp3', durationMs: 500 },
    chatResult: { content: 'Hello! How can I help?' },
  };
  const cfg = { ...defaults, ...overrides };

  return {
    transcribeAudio: vi.fn().mockResolvedValue(cfg.transcribeResult),
    synthesizeSpeechBinary: vi.fn().mockResolvedValue(cfg.synthesizeResult),
    deps: {
      aiClient: {
        chat: vi.fn().mockResolvedValue(cfg.chatResult),
      },
      voiceCache: null,
    },
  } as any;
}

function createConfig(overrides?: Partial<VoiceAgentConfig>): VoiceAgentConfig {
  return {
    personalityId: 'test-personality',
    sttProvider: 'deepgram',
    ttsProvider: 'openai',
    silenceThresholdMs: 50, // fast for tests
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('VoiceAgentSession', () => {
  let session: VoiceAgentSession;
  let manager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = createMockManager();
    session = new VoiceAgentSession(createConfig(), manager);
  });

  afterEach(async () => {
    await session.close();
    vi.useRealTimers();
  });

  it('should initialize with correct defaults', () => {
    expect(session.isClosed).toBe(false);
    expect(session.getConversationHistory()).toEqual([]);
  });

  it('should accept audio chunks and buffer them', async () => {
    const chunk = Buffer.from('audio-data-chunk-1');
    await session.processAudioChunk(chunk);
    // No immediate transcription — waits for silence
    expect(manager.transcribeAudio).not.toHaveBeenCalled();
  });

  it('should flush buffer after silence timeout', async () => {
    const transcript = vi.fn();
    session.on('transcript', transcript);

    await session.processAudioChunk(Buffer.from('audio-data'));

    // Advance past silence threshold
    vi.advanceTimersByTime(100);

    // Let async flush complete
    await vi.runAllTimersAsync();

    expect(manager.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        audioBase64: expect.any(String),
        format: 'webm',
        language: 'en',
      })
    );
  });

  it('should emit transcript events on STT completion', async () => {
    const transcripts: Array<{ type: string; text: string }> = [];
    session.on('transcript', (data) => transcripts.push(data));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    // Should have interim + final
    expect(transcripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'interim' }),
        expect.objectContaining({ type: 'final', text: 'hello world' }),
      ])
    );
  });

  it('should send transcript to LLM and get response', async () => {
    const responseTexts: string[] = [];
    session.on('response-text', (text) => responseTexts.push(text));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    expect(manager.deps.aiClient.chat).toHaveBeenCalled();
    expect(responseTexts).toContain('Hello! How can I help?');
  });

  it('should synthesize TTS and emit audio chunks', async () => {
    const audioChunks: Buffer[] = [];
    session.on('response-audio', (chunk) => audioChunks.push(chunk));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    expect(manager.synthesizeSpeechBinary).toHaveBeenCalled();
    expect(audioChunks.length).toBeGreaterThan(0);
    expect(Buffer.concat(audioChunks).toString()).toBe('fake-audio-data');
  });

  it('should emit done event after full pipeline', async () => {
    const done = vi.fn();
    session.on('done', done);

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    expect(done).toHaveBeenCalledTimes(1);
  });

  it('should maintain conversation history', async () => {
    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    const history = session.getConversationHistory();
    expect(history).toEqual([
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'Hello! How can I help?' },
    ]);
  });

  it('should handle interrupt by aborting TTS', async () => {
    // Create a slow TTS response
    manager.synthesizeSpeechBinary.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        buffer: Buffer.from('long-audio'),
        format: 'mp3',
        durationMs: 5000,
      }), 5000))
    );

    const audioChunks: Buffer[] = [];
    session.on('response-audio', (chunk) => audioChunks.push(chunk));

    await session.processAudioChunk(Buffer.from('audio'));
    vi.advanceTimersByTime(60); // trigger silence flush

    // Interrupt before TTS completes
    await session.interrupt();

    // TTS should be aborted — no audio chunks emitted
    expect(audioChunks.length).toBe(0);
  });

  it('should close cleanly', async () => {
    await session.processAudioChunk(Buffer.from('audio'));
    await session.close();

    expect(session.isClosed).toBe(true);

    // Should not process after close
    await session.processAudioChunk(Buffer.from('more-audio'));
    expect(manager.transcribeAudio).not.toHaveBeenCalled();
  });

  it('should emit error on transcription failure', async () => {
    manager.transcribeAudio.mockRejectedValueOnce(new Error('STT provider unavailable'));

    const errors: Error[] = [];
    session.on('error', (err) => errors.push(err));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('STT provider unavailable');
  });

  it('should emit error on LLM failure', async () => {
    manager.deps.aiClient.chat.mockRejectedValueOnce(new Error('LLM timeout'));

    const errors: Error[] = [];
    session.on('error', (err) => errors.push(err));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('LLM timeout');
  });

  it('should skip empty transcriptions', async () => {
    manager.transcribeAudio.mockResolvedValueOnce({ text: '   ', durationMs: 50 });

    const responseTexts: string[] = [];
    session.on('response-text', (text) => responseTexts.push(text));

    await session.processAudioChunk(Buffer.from('audio'));
    await vi.runAllTimersAsync();

    // No LLM call for empty transcript
    expect(manager.deps.aiClient.chat).not.toHaveBeenCalled();
    expect(responseTexts.length).toBe(0);
  });

  it('should force flush when buffer exceeds max size', async () => {
    const config = createConfig({ maxBufferBytes: 100 });
    const smallSession = new VoiceAgentSession(config, manager);

    const largeChunk = Buffer.alloc(150, 0x42);
    await smallSession.processAudioChunk(largeChunk);

    // Should have flushed immediately due to size
    // Wait for async processing
    await vi.runAllTimersAsync();

    expect(manager.transcribeAudio).toHaveBeenCalled();
    await smallSession.close();
  });

  it('should handle double close gracefully', async () => {
    await session.close();
    await session.close(); // should not throw
    expect(session.isClosed).toBe(true);
  });

  it('should handle interrupt when no TTS is active', async () => {
    await session.interrupt(); // should not throw
    expect(session.isClosed).toBe(false);
  });
});
