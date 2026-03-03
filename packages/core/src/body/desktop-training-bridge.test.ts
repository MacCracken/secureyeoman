import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesktopTrainingBridge } from './desktop-training-bridge.js';
import type { RecordActionParams } from './desktop-training-bridge.js';

function makeParams(overrides: Partial<RecordActionParams> = {}): RecordActionParams {
  return {
    sessionId: 'sess-001',
    actionType: 'click',
    actionTarget: '#submit-btn',
    actionValue: '',
    ...overrides,
  };
}

describe('DesktopTrainingBridge', () => {
  const mockRecordEpisode = vi.fn().mockResolvedValue({ id: 'ep-1' });

  const mockManager = {
    recordEpisode: mockRecordEpisode,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records action when manager is available', async () => {
    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => mockManager as any,
    });

    await bridge.recordAction(makeParams());

    expect(mockRecordEpisode).toHaveBeenCalledOnce();
    expect(mockRecordEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-001',
        actionType: 'click',
        actionTarget: '#submit-btn',
        actionValue: '',
      })
    );
  });

  it('no-ops when manager returns null', async () => {
    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => null,
    });

    await bridge.recordAction(makeParams());

    expect(mockRecordEpisode).not.toHaveBeenCalled();
  });

  it('silently catches errors from recordEpisode', async () => {
    mockRecordEpisode.mockRejectedValueOnce(new Error('DB connection lost'));

    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => mockManager as any,
    });

    // Should not throw
    await expect(bridge.recordAction(makeParams())).resolves.toBeUndefined();
    expect(mockRecordEpisode).toHaveBeenCalledOnce();
  });

  it('uses correct defaults (reward: 0, done: false, skillName: desktop_control)', async () => {
    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => mockManager as any,
    });

    await bridge.recordAction(makeParams());

    expect(mockRecordEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        reward: 0,
        done: false,
        skillName: 'desktop_control',
        stateEncoding: {},
      })
    );
  });

  it('passes custom skillName when provided', async () => {
    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => mockManager as any,
    });

    await bridge.recordAction(makeParams({ skillName: 'form_fill' }));

    expect(mockRecordEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'form_fill',
      })
    );
  });

  it('forwards stateEncoding when provided', async () => {
    const bridge = new DesktopTrainingBridge({
      getComputerUseManager: () => mockManager as any,
    });

    const stateEncoding = { viewport: { width: 1920, height: 1080 }, url: 'https://example.com' };
    await bridge.recordAction(makeParams({ stateEncoding }));

    expect(mockRecordEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        stateEncoding,
      })
    );
  });
});
