// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./useLicense', () => ({ useLicense: () => ({ refresh: vi.fn() }) }));
vi.mock('../api/client', () => ({ setLicenseKey: vi.fn() }));

const PRO_URL = 'https://store.example/checkout/pro';

function lemonScripts() {
  return document.querySelectorAll('script[src="https://app.lemonsqueezy.com/js/lemon.js"]');
}

/** Import a fresh copy of the hook (its checkout URLs are read at module load). */
async function importHook() {
  vi.resetModules();
  vi.stubEnv('VITE_LEMONSQUEEZY_PRO_URL', PRO_URL);
  vi.stubEnv('VITE_LEMONSQUEEZY_ENTERPRISE_URL', '');
  return (await import('./useLemonCheckout')).useLemonCheckout;
}

/** What lemon.js does once loaded: expose createLemonSqueezy(). */
function installFakeSdk() {
  const sdk = { Setup: vi.fn(), Url: { Open: vi.fn() } };
  window.createLemonSqueezy = () => {
    window.LemonSqueezy = sdk;
  };
  return sdk;
}

describe('useLemonCheckout', () => {
  beforeEach(() => {
    delete window.LemonSqueezy;
    delete window.createLemonSqueezy;
  });

  afterEach(() => {
    lemonScripts().forEach((s) => {
      s.remove();
    });
    delete window.LemonSqueezy;
    delete window.createLemonSqueezy;
    vi.unstubAllEnvs();
  });

  it('does not load lemon.js when the page merely renders', async () => {
    const useLemonCheckout = await importHook();
    renderHook(() => useLemonCheckout());
    expect(lemonScripts()).toHaveLength(0);
  });

  it('loads lemon.js on the first checkout click and opens the overlay', async () => {
    const useLemonCheckout = await importHook();
    const { result } = renderHook(() => useLemonCheckout());

    act(() => {
      result.current.openCheckout('pro');
    });
    expect(lemonScripts()).toHaveLength(1);
    expect(result.current.isLoading).toBe(true);

    const sdk = installFakeSdk();
    act(() => {
      lemonScripts()[0].dispatchEvent(new Event('load'));
    });

    await waitFor(() => {
      expect(sdk.Url.Open).toHaveBeenCalledWith(PRO_URL);
    });
    expect(sdk.Setup).toHaveBeenCalledTimes(1);

    // A second checkout reuses the loaded SDK instead of injecting it again.
    act(() => {
      result.current.openCheckout('pro');
    });
    await waitFor(() => {
      expect(sdk.Url.Open).toHaveBeenCalledTimes(2);
    });
    expect(lemonScripts()).toHaveLength(1);
  });

  it('reports a load failure and retries on the next click', async () => {
    const useLemonCheckout = await importHook();
    const { result } = renderHook(() => useLemonCheckout());

    act(() => {
      result.current.openCheckout('pro');
    });
    act(() => {
      lemonScripts()[0].dispatchEvent(new Event('error'));
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Checkout SDK could not be loaded. Please try again.');
    });
    expect(result.current.isLoading).toBe(false);
    expect(lemonScripts()).toHaveLength(0);

    act(() => {
      result.current.openCheckout('pro');
    });
    expect(lemonScripts()).toHaveLength(1);
  });

  it('does not load anything for an unconfigured tier', async () => {
    const useLemonCheckout = await importHook();
    const { result } = renderHook(() => useLemonCheckout());
    act(() => {
      result.current.openCheckout('enterprise');
    });
    expect(result.current.error).toBe('Checkout URL not configured for enterprise tier');
    expect(lemonScripts()).toHaveLength(0);
  });
});
