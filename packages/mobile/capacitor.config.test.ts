import { describe, it, expect } from 'vitest';
import config from './capacitor.config.js';

describe('Capacitor config', () => {
  it('has the correct appId', () => {
    expect(config.appId).toBe('com.secureyeoman.app');
  });

  it('has the correct appName', () => {
    expect(config.appName).toBe('SecureYeoman');
  });

  it('points webDir at the dashboard dist folder', () => {
    expect(config.webDir).toBe('../dashboard/dist');
  });

  it('does not have a live-reload server URL set by default', () => {
    expect(config.server?.url).toBeUndefined();
  });
});
