// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyRotationCard } from './KeyRotationCard';

vi.mock('../api/client', () => ({
  fetchKeyRotationStatus: vi.fn(),
  rotateKey: vi.fn(),
}));

import * as api from '../api/client';

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <KeyRotationCard />
    </QueryClientProvider>
  );
}

const mockStatuses = [
  {
    name: 'jwt-secret',
    category: 'jwt',
    status: 'ok',
    source: 'internal',
    autoRotate: true,
    lastRotatedAt: Date.now() - 86_400_000 * 5,
    expiresAt: null,
    rotationIntervalDays: 30,
    createdAt: Date.now() - 86_400_000 * 90,
  },
  {
    name: 'audit-key',
    category: 'audit_signing',
    status: 'expiring_soon',
    source: 'internal',
    autoRotate: true,
    lastRotatedAt: Date.now() - 86_400_000 * 25,
    expiresAt: Date.now() + 86_400_000 * 5,
    rotationIntervalDays: null,
    createdAt: Date.now() - 86_400_000 * 60,
  },
  {
    name: 'ext-api-key',
    category: 'api_key',
    status: 'ok',
    source: 'external',
    autoRotate: false,
    lastRotatedAt: null,
    expiresAt: null,
    rotationIntervalDays: null,
    createdAt: Date.now() - 86_400_000 * 30,
  },
  {
    name: 'encryption-key',
    category: 'encryption',
    status: 'expired',
    source: 'internal',
    autoRotate: false,
    lastRotatedAt: Date.now() - 86_400_000 * 365,
    expiresAt: null,
    rotationIntervalDays: null,
    createdAt: Date.now() - 86_400_000 * 400,
  },
];

describe('KeyRotationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchKeyRotationStatus).mockResolvedValue({
      statuses: mockStatuses,
    } as never);
  });

  it('should render Key Rotation heading', () => {
    renderCard();
    expect(screen.getByText('Key Rotation')).toBeInTheDocument();
  });

  it('should show tracked secrets count', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('4 tracked secrets')).toBeInTheDocument();
    });
  });

  it('should show status badges', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getAllByText('Healthy').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('should show category labels', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('JWT Token Secret')).toBeInTheDocument();
    });
    expect(screen.getByText('Audit Signing Key')).toBeInTheDocument();
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getByText('Encryption Key')).toBeInTheDocument();
  });

  it('should show Rotate Now button for internal auto-rotate keys', async () => {
    renderCard();
    await waitFor(() => {
      const rotateButtons = screen.getAllByText('Rotate Now');
      expect(rotateButtons.length).toBe(2); // jwt + audit
    });
  });

  it('should show External/Manual only for non-rotatable keys', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getAllByText('External').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Manual only')).toBeInTheDocument();
  });

  it('should show Internal/External source badges', async () => {
    renderCard();
    await waitFor(() => {
      const internalBadges = screen.getAllByText('Internal');
      expect(internalBadges.length).toBeGreaterThan(0);
    });
  });

  it('should show table headers', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Last Rotated')).toBeInTheDocument();
    expect(screen.getByText('Next Rotation')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
  });

  it('should show relative time for last rotation', async () => {
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('5 days ago')).toBeInTheDocument();
    });
    expect(screen.getByText('Never')).toBeInTheDocument(); // ext-api-key
  });

  it('should show loading state', () => {
    vi.mocked(api.fetchKeyRotationStatus).mockReturnValue(new Promise(() => {}));
    renderCard();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should show disabled state when rotation manager unavailable', async () => {
    vi.mocked(api.fetchKeyRotationStatus).mockRejectedValue(new Error('fail'));
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/Key rotation is not enabled/)).toBeInTheDocument();
    });
  });

  it('should show empty state', async () => {
    vi.mocked(api.fetchKeyRotationStatus).mockResolvedValue({ statuses: [] } as never);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('No tracked secrets.')).toBeInTheDocument();
    });
  });

  it('should call rotateKey on Rotate Now click', async () => {
    vi.mocked(api.rotateKey).mockResolvedValue({} as never);
    renderCard();
    await waitFor(() => {
      expect(screen.getAllByText('Rotate Now').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByText('Rotate Now')[0]);
    await waitFor(() => {
      expect(api.rotateKey).toHaveBeenCalledWith('jwt-secret');
    });
  });

  it('should show singular "tracked secret" for 1 item', async () => {
    vi.mocked(api.fetchKeyRotationStatus).mockResolvedValue({
      statuses: [mockStatuses[0]],
    } as never);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('1 tracked secret')).toBeInTheDocument();
    });
  });
});
