// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LicenseProvider } from '../hooks/useLicense';
import { FeatureLock } from './FeatureLock';

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
        <MemoryRouter>
          <LicenseProvider>{children}</LicenseProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('FeatureLock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders children when enforcement is off', async () => {
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
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FeatureLock feature="adaptive_learning">
          <div data-testid="child">Content</div>
        </FeatureLock>
      </Wrapper>
    );
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('This feature requires a Pro license')).not.toBeInTheDocument();
  });

  it('renders children when enforcement is on and feature is licensed', async () => {
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
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FeatureLock feature="adaptive_learning">
          <div data-testid="child">Content</div>
        </FeatureLock>
      </Wrapper>
    );
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('This feature requires a Pro license')).not.toBeInTheDocument();
  });

  it('shows lock overlay when enforcement is on and feature is not licensed', async () => {
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
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FeatureLock feature="adaptive_learning">
          <div data-testid="child">Content</div>
        </FeatureLock>
      </Wrapper>
    );
    expect(
      await screen.findByText('This feature requires a Pro license')
    ).toBeInTheDocument();
    expect(screen.getByText('Adaptive Learning Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
  });

  it('displays correct feature label for each feature', async () => {
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
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FeatureLock feature="cicd_integration">
          <div>Content</div>
        </FeatureLock>
      </Wrapper>
    );
    expect(await screen.findByText('CI/CD Integration')).toBeInTheDocument();
  });

  it('renders children as dimmed when locked', async () => {
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
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <FeatureLock feature="sso_saml">
          <div data-testid="child">Content</div>
        </FeatureLock>
      </Wrapper>
    );
    // The children are still in the DOM but dimmed
    await screen.findByText('This feature requires a Pro license');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    // The parent wrapper should have opacity class
    const dimmedDiv = container.querySelector('.opacity-40');
    expect(dimmedDiv).not.toBeNull();
  });

  it('applies custom className', async () => {
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
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <FeatureLock feature="multi_tenancy" className="my-custom-class">
          <div>Content</div>
        </FeatureLock>
      </Wrapper>
    );
    await screen.findByText('This feature requires a Pro license');
    const wrapper = container.querySelector('.my-custom-class');
    expect(wrapper).not.toBeNull();
  });
});
