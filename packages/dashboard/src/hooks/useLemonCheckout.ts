/**
 * LemonSqueezy checkout overlay hook.
 *
 * Loads lemon.js, opens the checkout overlay, and handles the success event.
 * After a successful purchase, retrieves the license key from the LemonSqueezy
 * checkout event and auto-applies it to the SY instance.
 *
 * Supports two flows:
 *   1. Direct: LS checkout returns the license key in the success event
 *   2. Fallback: Poll the licensing service for the key (legacy sy-licensing flow)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { setLicenseKey } from '../api/client';
import { useLicense } from './useLicense';

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: { Open: (url: string) => void };
      Setup: (opts: { eventHandler: (event: LemonEvent) => void }) => void;
    };
  }
}

interface LemonEvent {
  event: string;
  data?: {
    order?: { data?: { id?: string; attributes?: { urls?: { license_key?: string } } } };
  };
}

/** Checkout URLs per tier. Set via env vars at build time. */
const CHECKOUT_URLS = {
  pro: import.meta.env.VITE_LEMONSQUEEZY_PRO_URL ?? '',
  solopreneur: import.meta.env.VITE_LEMONSQUEEZY_SOLOPRENEUR_URL ?? '',
  enterprise: import.meta.env.VITE_LEMONSQUEEZY_ENTERPRISE_URL ?? '',
};

/** Licensing service base URL (optional — only needed for legacy polling flow). */
const LICENSING_API = import.meta.env.VITE_LICENSING_API_URL ?? '';

export type CheckoutTier = 'pro' | 'solopreneur' | 'enterprise';

export function useLemonCheckout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptLoaded = useRef(false);
  const { refresh } = useLicense();

  // Load lemon.js once
  useEffect(() => {
    if (scriptLoaded.current || typeof document === 'undefined') return;

    const existing = document.querySelector('script[src*="lemonsqueezy"]');
    if (existing) {
      scriptLoaded.current = true;
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
    script.defer = true;
    script.onload = () => {
      scriptLoaded.current = true;
      window.createLemonSqueezy?.();
    };
    document.body.appendChild(script);
  }, []);

  const openCheckout = useCallback(
    (tier: CheckoutTier) => {
      const url = CHECKOUT_URLS[tier];
      if (!url) {
        setError(`Checkout URL not configured for ${tier} tier`);
        return;
      }

      if (!window.LemonSqueezy) {
        setError('Checkout SDK not loaded. Please try again.');
        return;
      }

      setError(null);
      setIsLoading(true);

      // Listen for checkout success
      window.LemonSqueezy.Setup({
        eventHandler: (event: LemonEvent) => {
          if (event.event === 'Checkout.Success') {
            void handleCheckoutSuccess(event);
          }
        },
      });

      // Open the overlay
      window.LemonSqueezy.Url.Open(url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function handleCheckoutSuccess(event: LemonEvent): Promise<void> {
    // Try to get the license key directly from the LS checkout event
    const licenseKey = event.data?.order?.data?.attributes?.urls?.license_key;
    if (licenseKey) {
      try {
        await setLicenseKey(licenseKey);
        await refresh();
        setIsLoading(false);
        return;
      } catch {
        // Fall through to polling if direct application fails
      }
    }

    // Fallback: poll the licensing service (legacy sy-licensing flow)
    const orderId = event.data?.order?.data?.id;
    if (orderId && LICENSING_API) {
      await pollForLicenseKey(orderId);
    } else {
      setIsLoading(false);
      setError('Purchase successful! Apply your license key from the confirmation email.');
    }
  }

  // Poll the licensing service for the key after purchase (legacy fallback)
  async function pollForLicenseKey(orderId: string): Promise<void> {
    const maxAttempts = 10;
    const delayMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(
          `${LICENSING_API}/api/v1/licenses/by-order/${encodeURIComponent(orderId)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { licenseKey?: string };
          if (data.licenseKey) {
            await setLicenseKey(data.licenseKey);
            await refresh();
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Licensing service may not have processed the webhook yet
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    setIsLoading(false);
    setError('License key is being generated. Check your email or apply it manually.');
  }

  const isConfigured = Boolean(CHECKOUT_URLS.pro || CHECKOUT_URLS.enterprise);

  return { openCheckout, isLoading, error, isConfigured };
}
