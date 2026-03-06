// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  LicenseProvider,
  useLicense,
  ALL_LICENSED_FEATURES,
  ALL_ENTERPRISE_FEATURES,
} from './useLicense';

vi.mock('../api/client', () => ({
  fetchLicenseStatus: vi.fn(),
}));

import { fetchLicenseStatus } from '../api/client';
const mockFetchLicenseStatus = vi.mocked(fetchLicenseStatus);

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <LicenseProvider>{children}</LicenseProvider>
      </QueryClientProvider>
    );
  };
}

describe('useLicense', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws when used outside LicenseProvider', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    expect(() =>
      renderHook(() => useLicense(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      })
    ).toThrow('useLicense must be used within a LicenseProvider');
  });

  it('returns loading state initially', () => {
    mockFetchLicenseStatus.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.license).toBeNull();
    expect(result.current.isEnterprise).toBe(false);
  });

  it('returns community tier license data', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      features: [],
      licenseId: null,
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.license?.tier).toBe('community');
    expect(result.current.isEnterprise).toBe(false);
  });

  it('returns enterprise tier license data', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 25,
      features: ['adaptive_learning', 'sso_saml'],
      licenseId: 'lic-123',
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnterprise).toBe(true);
    expect(result.current.license?.organization).toBe('Acme Corp');
  });

  it('hasFeature returns true for all features when enforcement is off', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      features: [],
      licenseId: null,
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasFeature('adaptive_learning')).toBe(true);
    expect(result.current.hasFeature('sso_saml')).toBe(true);
  });

  it('hasFeature checks license when enforcement is on', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme',
      seats: 10,
      features: ['adaptive_learning', 'cicd_integration'],
      licenseId: 'lic-1',
      expiresAt: null,
      error: null,
      enforcementEnabled: true,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasFeature('adaptive_learning')).toBe(true);
    expect(result.current.hasFeature('cicd_integration')).toBe(true);
    expect(result.current.hasFeature('sso_saml')).toBe(false);
    expect(result.current.hasFeature('multi_tenancy')).toBe(false);
  });

  it('hasFeature returns false on community tier when enforcement is on', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      features: [],
      licenseId: null,
      expiresAt: null,
      error: null,
      enforcementEnabled: true,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasFeature('adaptive_learning')).toBe(false);
    expect(result.current.hasFeature('sso_saml')).toBe(false);
  });

  it('enforcementEnabled is exposed in context value', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-1',
      expiresAt: null,
      error: null,
      enforcementEnabled: true,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enforcementEnabled).toBe(true);
  });

  it('isEnterprise is false when tier is enterprise but valid is false', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: false,
      organization: 'Acme',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-expired',
      expiresAt: '2020-01-01T00:00:00Z',
      error: 'License expired',
      enforcementEnabled: true,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnterprise).toBe(false);
    expect(result.current.hasFeature('adaptive_learning')).toBe(false);
  });

  it('exports ALL_LICENSED_FEATURES with 18 features (6 pro + 12 enterprise)', () => {
    expect(ALL_LICENSED_FEATURES).toHaveLength(18);
    // Pro features
    expect(ALL_LICENSED_FEATURES).toContain('advanced_brain');
    expect(ALL_LICENSED_FEATURES).toContain('provider_management');
    expect(ALL_LICENSED_FEATURES).toContain('batch_inference');
    // Enterprise features
    expect(ALL_LICENSED_FEATURES).toContain('adaptive_learning');
    expect(ALL_LICENSED_FEATURES).toContain('sso_saml');
    expect(ALL_LICENSED_FEATURES).toContain('multi_tenancy');
    expect(ALL_LICENSED_FEATURES).toContain('cicd_integration');
    expect(ALL_LICENSED_FEATURES).toContain('advanced_observability');
    expect(ALL_LICENSED_FEATURES).toContain('supply_chain');
  });

  it('exports ALL_ENTERPRISE_FEATURES as deprecated alias', () => {
    expect(ALL_ENTERPRISE_FEATURES).toEqual(ALL_LICENSED_FEATURES);
  });

  it('returns pro tier license data with isEnterprise=true', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'pro',
      valid: true,
      organization: 'Acme Corp',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-pro-1',
      expiresAt: null,
      error: null,
      enforcementEnabled: true,
    });
    const { result } = renderHook(() => useLicense(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnterprise).toBe(true);
    expect(result.current.license?.tier).toBe('pro');
    expect(result.current.hasFeature('adaptive_learning')).toBe(true);
    expect(result.current.hasFeature('sso_saml')).toBe(false);
  });
});
